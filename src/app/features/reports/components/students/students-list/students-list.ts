import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Student, SchoolClass, currentAcademicYear, generateAcademicYears, TERMS } from '../../../../../models/school.model';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';
import { ClassFeeExportService } from '../../../services/class-fee-export.service';

@Component({
  selector: 'app-students-list',
  standalone: false,
  templateUrl: './students-list.html',
  styleUrl: './students-list.scss',
})
export class StudentsList implements OnInit, OnDestroy {
 private destroy$ = new Subject<void>();

  students: Student[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  exporting = false;
  errorMessage = '';
  successMessage = '';

  totalStudents = 0;
  currentPage = 1;
  pageSize = 20;
  get totalPages() { return Math.ceil(this.totalStudents / this.pageSize); }

  filterForm!: FormGroup;
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Fee data per student
  feeTerm = TERMS[0];
  feeYear = currentAcademicYear();
  feeDataMap: Map<string, any> = new Map();

  // Selection
  selectedStudentIds = new Set<string>();

  // Modals
  showExportModal = false;
  showBrandingModal = false;

  // Print
  printStatements: any[] = [];
  printBrandingName = '';

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private classFeeExport: ClassFeeExportService,
    private pdfBranding: PdfBrandingService,
  ) {}

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      search: [''],
      classId: [''],
      isActive: ['true'],
    });

    this.filterForm.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadStudents();
      });

    this.loadClasses();
    this.loadStudents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService.getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadStudents(): void {
    this.loading = true;
    const { search, classId, isActive } = this.filterForm.value;

    this.schoolService.getStudents(
      {
        search: search || undefined,
        classId: classId || undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
      },
      this.currentPage,
      this.pageSize,
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ data, count }) => {
        this.students = data;
        this.totalStudents = count;
        this.loading = false;
        if (this.permissionService.school.fees) {
          this.loadFeeData();
        }
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to load students';
        this.loading = false;
      },
    });
  }

  // ── Fee data for all visible students ────────────────────

  loadFeeData(): void {
    if (this.students.length === 0) return;
    const studentIds = this.students.map(s => s.id);

    // Fetch student_fees for all visible students in one query
    this.schoolService
      .getStudentFeesForMultiple(studentIds, this.feeYear, this.feeTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.feeDataMap.clear();
          const map: { [sid: string]: any } = {};

          fees.forEach((fee: any) => {
            const sid = fee.student_id;
            if (!map[sid]) {
              map[sid] = { totalDue: 0, totalPaid: 0, totalBalance: 0, status: 'paid', fees: [] };
            }
            map[sid].totalDue += Number(fee.amount_due);
            map[sid].totalPaid += Number(fee.amount_paid);
            map[sid].totalBalance += Number(fee.balance);
            map[sid].fees.push({
              feeName: fee.fee_structure?.fee_name || 'Fee',
              amountDue: Number(fee.amount_due),
              amountPaid: Number(fee.amount_paid),
              balance: Number(fee.balance),
              status: fee.status,
            });
            if (fee.status === 'unpaid') map[sid].status = 'unpaid';
            else if (fee.status === 'partial' && map[sid].status !== 'unpaid')
              map[sid].status = 'partial';
          });

          Object.entries(map).forEach(([sid, data]) => {
            this.feeDataMap.set(sid, data);
          });
        },
        error: () => { /* fee data unavailable — show dashes */ },
      });
  }

  getStudentFeeData(studentId: string): any {
    return this.feeDataMap.get(studentId) || null;
  }

  onFeeFilterChange(): void {
    this.loadFeeData();
  }

  // ── Selection ─────────────────────────────────────────────

  get allSelected(): boolean {
    return this.students.length > 0 &&
      this.students.every(s => this.selectedStudentIds.has(s.id));
  }

  get someSelected(): boolean {
    return this.selectedStudentIds.size > 0 && !this.allSelected;
  }

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.students.forEach(s => this.selectedStudentIds.add(s.id));
    } else {
      this.students.forEach(s => this.selectedStudentIds.delete(s.id));
    }
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  toggleStudent(studentId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) this.selectedStudentIds.add(studentId);
    else this.selectedStudentIds.delete(studentId);
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  clearSelection(): void {
    this.selectedStudentIds.clear();
    this.selectedStudentIds = new Set();
  }

  // ── Export selected as PDF ────────────────────────────────

  async exportSelected(): Promise<void> {
    if (this.selectedStudentIds.size === 0) return;
    this.exporting = true;
    try {
      const branding = await this.pdfBranding.getBranding();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
      let isFirst = true;

      for (const studentId of this.selectedStudentIds) {
        const student = this.students.find(s => s.id === studentId);
        const fd = this.feeDataMap.get(studentId);
        if (!student) continue;

        if (!isFirst) doc.addPage();
        isFirst = false;

        // Header
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pw, 28, 'F');
        if (branding.logoBase64) {
          try {
            doc.addImage(
              branding.logoBase64,
              branding.logoMimeType.replace('image/', '').toUpperCase(),
              14, 4, 18, 18,
            );
          } catch { /* skip */ }
        }
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text(branding.name, 36, 13);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text('Student Fee Statement', 36, 21);
        if (branding.tagline) { doc.setFontSize(8); doc.text(branding.tagline, 36, 27); }
        doc.setFontSize(8);
        doc.text(today, pw - 14, 21, { align: 'right' });

        // Student info
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 34, pw - 28, 30, 3, 3, 'F');
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text(this.getFullName(student), 20, 43);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(`Student No: ${student.student_number}`, 20, 50);
        doc.text(`Class: ${student.class?.name || '—'}`, 20, 56);
        doc.text(`${this.feeTerm}  |  ${this.feeYear}`, 20, 62);

        if (fd) {
          // Summary boxes
          const statusColors: Record<string, [number, number, number]> = {
            paid: [6, 95, 70], partial: [146, 64, 14], unpaid: [153, 27, 27],
          };
          const statusBg: Record<string, [number, number, number]> = {
            paid: [209, 250, 229], partial: [254, 243, 199], unpaid: [254, 226, 226],
          };
          const st = fd.status || 'unpaid';
          doc.setFillColor(...(statusBg[st] || statusBg['unpaid']));
          doc.roundedRect(pw - 52, 36, 38, 12, 3, 3, 'F');
          doc.setTextColor(...(statusColors[st] || statusColors['unpaid']));
          doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          doc.text(st.charAt(0).toUpperCase() + st.slice(1), pw - 33, 44, { align: 'center' });

          const boxes = [
            { label: 'Total Due', value: this.fmtPDF(fd.totalDue), color: [238, 242, 255] as [number, number, number], text: [79, 70, 229] as [number, number, number] },
            { label: 'Total Paid', value: this.fmtPDF(fd.totalPaid), color: [209, 250, 229] as [number, number, number], text: [6, 95, 70] as [number, number, number] },
            { label: 'Balance', value: this.fmtPDF(fd.totalBalance), color: fd.totalBalance > 0 ? [254, 226, 226] as [number, number, number] : [209, 250, 229] as [number, number, number], text: fd.totalBalance > 0 ? [153, 27, 27] as [number, number, number] : [6, 95, 70] as [number, number, number] },
          ];
          const bw = (pw - 28 - 12) / 3;
          boxes.forEach((box, i) => {
            const x = 14 + i * (bw + 6);
            doc.setFillColor(...box.color);
            doc.roundedRect(x, 70, bw, 22, 3, 3, 'F');
            doc.setTextColor(...box.text);
            doc.setFontSize(8); doc.setFont('helvetica', 'normal');
            doc.text(box.label, x + bw / 2, 78, { align: 'center' });
            doc.setFontSize(12); doc.setFont('helvetica', 'bold');
            doc.text(box.value, x + bw / 2, 87, { align: 'center' });
          });

          // Fee table
          autoTable(doc, {
            startY: 100,
            head: [['Fee Item', 'Amount Due', 'Amount Paid', 'Balance', 'Status']],
            body: fd.fees.length > 0
              ? fd.fees.map((f: any) => [
                  f.feeName,
                  this.fmtPDF(f.amountDue),
                  this.fmtPDF(f.amountPaid),
                  this.fmtPDF(f.balance),
                  f.status.charAt(0).toUpperCase() + f.status.slice(1),
                ])
              : [['No fees assigned', '', '', '', '']],
            foot: fd.fees.length > 0 ? [[
              'TOTAL',
              this.fmtPDF(fd.totalDue),
              this.fmtPDF(fd.totalPaid),
              this.fmtPDF(fd.totalBalance),
              '',
            ]] : undefined,
            styles: { fontSize: 9, cellPadding: 3.5 },
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
            footStyles: { fillColor: [255, 247, 237], textColor: [146, 64, 14], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            columnStyles: {
              1: { halign: 'right' }, 2: { halign: 'right' },
              3: { halign: 'right', textColor: [220, 38, 38] as [number, number, number] },
              4: { halign: 'center' },
            },
          });
        } else {
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(11); doc.setFont('helvetica', 'normal');
          doc.text('No fee data available for this term.', pw / 2, 85, { align: 'center' });
        }

        // Footer
        doc.setFontSize(7); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
        doc.text(
          `${branding.name}${branding.address ? '  •  ' + branding.address : ''}${branding.phone ? '  •  ' + branding.phone : ''}`,
          pw / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' },
        );
        doc.text(
          'This is an official fee statement.',
          pw / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' },
        );
      }

      const blob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee_statements_${this.feeTerm.replace(' ', '_')}_${this.feeYear.replace('/', '-')}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exporting = false;
    }
  }

  // ── Print selected ────────────────────────────────────────

  async printSelected(): Promise<void> {
    if (this.selectedStudentIds.size === 0) return;
    const branding = await this.pdfBranding.getBranding();
    this.printBrandingName = branding.name;

    this.printStatements = [];
    for (const studentId of this.selectedStudentIds) {
      const student = this.students.find(s => s.id === studentId);
      const fd = this.feeDataMap.get(studentId);
      if (!student) continue;
      this.printStatements.push({
        studentName: this.getFullName(student),
        studentNumber: student.student_number,
        className: student.class?.name || '—',
        fees: fd?.fees || [],
        totalDue: fd?.totalDue || 0,
        totalPaid: fd?.totalPaid || 0,
        totalBalance: fd?.totalBalance || 0,
        status: fd?.status || '—',
      });
    }

    // Wait for Angular to render then print
    setTimeout(() => window.print(), 300);
  }

  // ── Export single student statement ───────────────────────

  async exportStudentStatement(studentId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.classFeeExport.exportStudentPDF(studentId, this.feeYear, this.feeTerm);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    }
  }

  // ── Navigation ────────────────────────────────────────────

  viewStudent(id: string): void { this.router.navigate(['main/reports/students', id]); }
  addStudent(): void { this.router.navigate(['main/reports/students/add']); }
  editStudent(id: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/reports/students', id, 'edit']);
  }

  previousPage(): void { if (this.currentPage > 1) { this.currentPage--; this.loadStudents(); } }
  nextPage(): void { if (this.currentPage < this.totalPages) { this.currentPage++; this.loadStudents(); } }

  clearFilters(): void {
    this.filterForm.reset({ search: '', classId: '', isActive: 'true' });
  }

  openExport(): void { this.showExportModal = true; }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    // existing export logic — keep as is
    this.showExportModal = false;
  }

  // ── Helpers ──────────────────────────────────────────────

  getFullName(student: Student): string {
    return `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim();
  }

  getInitials(student: Student): string {
    return `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  }

  private fmtPDF(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS', currencyDisplay: 'code',
    }).format(amount || 0);
  }
}



