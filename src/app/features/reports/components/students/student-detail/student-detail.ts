import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  Student,
  StudentFee,
  FeePayment,
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../../models/school.model';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-student-detail',
  standalone: false,
  templateUrl: './student-detail.html',
  styleUrl: './student-detail.scss',
})
export class StudentDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  student: Student | null = null;
  fees: StudentFee[] = [];
  payments: FeePayment[] = [];
  loading = true;
  errorMessage = '';
  successMessage = '';

  activeTab: 'overview' | 'fees' | 'payments' = 'overview';

  currentAcademicYear = currentAcademicYear();
  currentTerm = TERMS[0];
  terms = TERMS;
  academicYears: string[] = generateAcademicYears();

  exportingStatement = false;

  showDeleteFeeModal = false;
  feeToDelete: StudentFee | null = null;
  deletingFee = false;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
    private route: ActivatedRoute,
    private pdfBranding: PdfBrandingService,
  ) {}

  ngOnInit(): void {
    this.studentId = this.route.snapshot.paramMap.get('id') || '';

    // Read term/year from query params if coming from students list
    const term = this.route.snapshot.queryParamMap.get('term');
    const year = this.route.snapshot.queryParamMap.get('year');
    if (term) this.currentTerm = term;
    if (year) this.currentAcademicYear = year;

    this.loadStudent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStudent(): void {
    this.loading = true;
    this.schoolService
      .getStudentById(this.studentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (student) => {
          this.student = student;
          this.loading = false;
          this.loadFees();
          this.loadPayments();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load student';
          this.loading = false;
        },
      });
  }

  loadFees(): void {
    this.schoolService
      .getStudentFees(
        this.studentId,
        this.currentAcademicYear,
        this.currentTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => (this.fees = fees),
        error: (err) => console.error(err),
      });
  }

  loadPayments(): void {
    this.schoolService
      .getPayments(
        {
          studentId: this.studentId,
          academicYear: this.currentAcademicYear,
          term: this.currentTerm,
        },
        1,
        50,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => (this.payments = data),
        error: (err) => console.error(err),
      });
  }

  onTermChange(): void {
    this.loadFees();
    this.loadPayments();
  }

  goBack(): void {
    this.router.navigate(['main/reports/students']);
  }

  editStudent(): void {
    this.router.navigate(['main/reports/students', this.studentId, 'edit']);
  }

  recordPayment(): void {
    this.router.navigate(['main/reports/fees/record', this.studentId]);
  }

  viewReceipt(receiptNumber: string): void {
    this.router.navigate(['main/reports/receipts', receiptNumber]);
  }

  getFullName(): string {
    if (!this.student) return '';
    return `${this.student.first_name} ${this.student.middle_name || ''} ${this.student.last_name}`.trim();
  }

  getInitials(): string {
    if (!this.student) return '';
    return `${this.student.first_name[0]}${this.student.last_name[0]}`.toUpperCase();
  }

  getTotalDue(): number {
    return this.fees.reduce((s, f) => s + f.amount_due, 0);
  }

  getTotalPaid(): number {
    return this.fees.reduce((s, f) => s + f.amount_paid, 0);
  }

  getTotalBalance(): number {
    return this.getTotalDue() - this.getTotalPaid();
  }

  getFeeStatusClass(status: string): string {
    const map: Record<string, string> = {
      paid: 'status-paid',
      partial: 'status-partial',
      unpaid: 'status-unpaid',
    };
    return map[status] || '';
  }

  /**
   * Currency formatter for ON-SCREEN display.
   * Uses the native Ghana cedi symbol (₵) — renders correctly in all browsers.
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  /**
   * Currency formatter for PDF output.
   *
   * jsPDF's default helvetica/times/courier fonts use WinAnsi encoding,
   * which does NOT include the cedi symbol (₵ / U+20B5). When Intl
   * outputs "GH₵0.00", jsPDF falls back to the micro sign and renders
   * it as "GH µ0.00".
   *
   * To avoid embedding a custom Unicode font (~150-300 KB per weight),
   * we format manually with the "GHS " ISO 4217 prefix instead — this is
   * also the standard format used by Ghanaian banks and formal invoices.
   */
  formatCurrencyPdf(amount: number): string {
    const value = Number(amount || 0).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `GHS ${value}`;
  }

  calculateAge(dob?: string): number | null {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() < birth.getDate())
    )
      age--;
    return age;
  }

  async exportStatementOfBilling(): Promise<void> {
    if (!this.student) return;
    this.exportingStatement = true;

    try {
      const branding = await this.pdfBranding.getBranding();

      // Also fetch ALL payments for this student/term for the history section
      const allPayments = this.payments; // already loaded

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      // ── HEADER BANNER ──────────────────────────────────────
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pw, 30, 'F');

      if (branding.logoBase64) {
        try {
          doc.addImage(
            branding.logoBase64,
            branding.logoMimeType.replace('image/', '').toUpperCase(),
            12,
            4,
            20,
            20,
          );
        } catch {
          /* skip */
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(branding.name, 38, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Statement of Billing', 38, 22);
      doc.setFontSize(8);
      doc.text(today, pw - 12, 22, { align: 'right' });

      // ── DOCUMENT TITLE BAR ─────────────────────────────────
      doc.setFillColor(238, 242, 255);
      doc.rect(0, 30, pw, 10, 'F');
      doc.setTextColor(79, 70, 229);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('STUDENT FEE STATEMENT', pw / 2, 37, { align: 'center' });

      // ── STUDENT INFO BOX ───────────────────────────────────
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(10, 44, pw - 20, 32, 3, 3, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(10, 44, pw - 20, 32, 3, 3, 'S');

      // Left column
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('STUDENT NAME', 16, 52);
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(this.getFullName(), 16, 59);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('STUDENT NO.', 16, 67);
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(this.student.student_number || '—', 16, 73);

      // Right column
      const col2 = pw / 2 + 5;
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('CLASS / GRADE', col2, 52);
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(this.student.class?.name || '—', col2, 59);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('TERM / ACADEMIC YEAR', col2, 67);
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${this.currentTerm}  |  ${this.currentAcademicYear}`, col2, 73);

      // ── SUMMARY BOXES (Total Due / Paid / Balance) ─────────
      const totalDue = this.getTotalDue();
      const totalPaid = this.getTotalPaid();
      const totalBalance = this.getTotalBalance();

      const boxes = [
        {
          label: 'TOTAL FEES',
          value: this.formatCurrencyPdf(totalDue),
          bg: [238, 242, 255] as [number, number, number],
          fg: [79, 70, 229] as [number, number, number],
        },
        {
          label: 'AMOUNT PAID',
          value: this.formatCurrencyPdf(totalPaid),
          bg: [209, 250, 229] as [number, number, number],
          fg: [6, 95, 70] as [number, number, number],
        },
        {
          label: 'BALANCE DUE',
          value: this.formatCurrencyPdf(totalBalance),
          bg:
            totalBalance > 0
              ? ([254, 226, 226] as [number, number, number])
              : ([209, 250, 229] as [number, number, number]),
          fg:
            totalBalance > 0
              ? ([153, 27, 27] as [number, number, number])
              : ([6, 95, 70] as [number, number, number]),
        },
      ];
      const bw = (pw - 20 - 8) / 3;
      boxes.forEach((box, i) => {
        const x = 10 + i * (bw + 4);
        doc.setFillColor(...box.bg);
        doc.roundedRect(x, 82, bw, 20, 3, 3, 'F');
        doc.setTextColor(...box.fg);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(box.label, x + bw / 2, 89, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(box.value, x + bw / 2, 97, { align: 'center' });
      });

      // ── FEE ITEMS TABLE ────────────────────────────────────
      let startY = 108;

      // Section header
      doc.setFillColor(79, 70, 229);
      doc.rect(10, startY, pw - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('FEE BREAKDOWN', 14, startY + 5);
      startY += 7;

      autoTable(doc, {
        startY,
        margin: { left: 10, right: 10 },
        head: [
          ['Fee Description', 'Amount Due', 'Amount Paid', 'Balance', 'Status'],
        ],
        body:
          this.fees.length > 0
            ? this.fees.map((f) => [
                f.fee_name ?? '',
                this.formatCurrencyPdf(f.amount_due),
                this.formatCurrencyPdf(f.amount_paid),
                this.formatCurrencyPdf(f.amount_due - f.amount_paid),
                f.status
                  ? f.status.charAt(0).toUpperCase() + f.status.slice(1)
                  : '',
              ])
            : [['No fees assigned for this term', '', '', '', '']],
        foot:
          this.fees.length > 0
            ? [
                [
                  'TOTAL',
                  this.formatCurrencyPdf(totalDue),
                  this.formatCurrencyPdf(totalPaid),
                  this.formatCurrencyPdf(totalBalance),
                  '',
                ],
              ]
            : undefined,
        styles: { fontSize: 9, cellPadding: 3.5, font: 'helvetica' },
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
        footStyles: {
          fillColor: [255, 247, 237],
          textColor: [146, 64, 14],
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          1: { halign: 'right' },
          2: {
            halign: 'right',
            textColor: [5, 150, 105] as [number, number, number],
          },
          3: {
            halign: 'right',
            textColor: [220, 38, 38] as [number, number, number],
          },
          4: { halign: 'center' },
        },
      });

      // ── PAYMENT HISTORY TABLE ──────────────────────────────
      const afterFees = (doc as any).lastAutoTable.finalY + 6;

      if (this.payments.length > 0) {
        // Section header
        doc.setFillColor(16, 185, 129);
        doc.rect(10, afterFees, pw - 20, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('PAYMENT HISTORY', 14, afterFees + 5);

        autoTable(doc, {
          startY: afterFees + 7,
          margin: { left: 10, right: 10 },
          head: [
            [
              '#',
              'Receipt No.',
              'Date',
              'Amount Paid',
              'Method',
              'Received By',
            ],
          ],
          body: this.payments.map((p, idx) => [
            `${idx + 1}`,
            p.receipt_number,
            new Date(p.payment_date).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            this.formatCurrencyPdf(p.amount),
            p.payment_method || '—',
            (p as any).received_by_name || '—',
          ]),
          styles: { fontSize: 8.5, cellPadding: 3, font: 'helvetica' },
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: { fillColor: [240, 253, 244] },
          columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            3: { halign: 'right', fontStyle: 'bold' },
            4: { halign: 'center' },
          },
        });
      } else {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(10, afterFees, pw - 20, 16, 3, 3, 'F');
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(
          'No payments recorded for this term yet.',
          pw / 2,
          afterFees + 10,
          { align: 'center' },
        );
      }

      // ── SIGNATURE + FOOTER ─────────────────────────────────
      const finalY =
        this.payments.length > 0
          ? (doc as any).lastAutoTable.finalY + 12
          : afterFees + 24;

      // Signature lines
      if (finalY + 30 < ph - 16) {
        doc.setDrawColor(209, 213, 219);
        doc.line(12, finalY + 18, 72, finalY + 18);
        doc.line(pw - 72, finalY + 18, pw - 12, finalY + 18);
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Parent / Guardian Signature', 42, finalY + 23, {
          align: 'center',
        });
        doc.text('Authorised by', pw - 42, finalY + 23, { align: 'center' });
      }

      // Footer bar
      doc.setFillColor(79, 70, 229);
      doc.rect(0, ph - 12, pw, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${branding.name}${branding.address ? '  •  ' + branding.address : ''}${branding.phone ? '  •  Tel: ' + branding.phone : ''}  •  This is an official fee statement`,
        pw / 2,
        ph - 5,
        { align: 'center' },
      );

      // Download
      const safeName = this.getFullName().replace(/\s+/g, '_').toUpperCase();
      const safeTerm = this.currentTerm.replace(/\s+/g, '_');
      doc.save(
        `${safeName}_${safeTerm}_${this.currentAcademicYear.replace('/', '-')}_STATEMENT.pdf`,
      );
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exportingStatement = false;
    }
  }

  getTotalPaymentsAmount(): number {
    return this.payments.reduce((s, p) => s + Number(p.amount), 0);
  }

  // ADD these methods before getTotalPaymentsAmount():
  confirmDeleteFee(fee: StudentFee, event: Event): void {
    event.stopPropagation();
    this.feeToDelete = fee;
    this.showDeleteFeeModal = true;
  }

  closeDeleteFeeModal(): void {
    if (!this.deletingFee) {
      this.showDeleteFeeModal = false;
      this.feeToDelete = null;
    }
  }

  executeDeleteFee(): void {
    if (!this.feeToDelete) return;
    this.deletingFee = true;

    this.schoolService
      .removeFeeFromStudent(this.feeToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `"${this.feeToDelete?.fee_name}" removed successfully.`;
          this.deletingFee = false;
          this.showDeleteFeeModal = false;
          this.feeToDelete = null;
          this.loadFees();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to remove fee';
          this.deletingFee = false;
          this.showDeleteFeeModal = false;
        },
      });
  }

  navigatToReceipts() {
    this.router.navigate(['main/reports/fees/receipts'], {
      queryParams: {
        term: this.currentTerm,
        year: this.currentAcademicYear,
      },
    });
  }
}
