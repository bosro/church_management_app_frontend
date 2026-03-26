import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass, TERMS } from '../../../../../models/school.model';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';

@Component({
  selector: 'app-fee-report',
  standalone: false,
  templateUrl: './fee-report.html',
  styleUrl: './fee-report.scss',
})
export class FeeReport implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  outstandingFees: any[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';

  selectedTerm = TERMS[0];
  selectedYear = '';
  selectedClassId = '';
  terms = TERMS;
  academicYears: string[] = [];

  showExportModal = false;
  exporting = false;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private pdfBranding: PdfBrandingService,
  ) {}

  ngOnInit(): void {
    const year = new Date().getFullYear();
    this.selectedYear = `${year}/${year + 1}`;
    this.academicYears = [`${year}/${year + 1}`, `${year - 1}/${year}`];
    this.loadClasses();
    this.loadReport();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService.getClasses().pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadReport(): void {
    this.loading = true;
    this.errorMessage = '';
    this.schoolService.getOutstandingFees(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.outstandingFees = this.selectedClassId
            ? fees.filter((f) => f.student?.class_id === this.selectedClassId)
            : fees;
          this.loading = false;
        },
        error: (err) => { this.errorMessage = err.message || 'Failed to load report'; this.loading = false; },
      });
  }

  onFilterChange(): void { this.loadReport(); }

  // ── Computed ─────────────────────────────────────────────

  get studentSummaries(): any[] {
    const map: { [key: string]: any } = {};
    this.outstandingFees.forEach((fee) => {
      const sid = fee.student_id;
      if (!map[sid]) map[sid] = { student: fee.student, fees: [], totalDue: 0, totalPaid: 0, totalBalance: 0 };
      map[sid].fees.push(fee);
      map[sid].totalDue += Number(fee.amount_due);
      map[sid].totalPaid += Number(fee.amount_paid);
      map[sid].totalBalance += Number(fee.amount_due) - Number(fee.amount_paid);
    });
    return Object.values(map).sort((a, b) => b.totalBalance - a.totalBalance);
  }

  get grandTotalDue(): number    { return this.studentSummaries.reduce((s, r) => s + r.totalDue, 0); }
  get grandTotalPaid(): number   { return this.studentSummaries.reduce((s, r) => s + r.totalPaid, 0); }
  get grandTotalBalance(): number { return this.studentSummaries.reduce((s, r) => s + r.totalBalance, 0); }

  // ── Navigation ───────────────────────────────────────────

  viewStudent(studentId: string): void { this.router.navigate(['main/reports/students', studentId]); }
  recordPayment(studentId: string): void { this.router.navigate(['main/reports/fees/record', studentId]); }
  printReport(): void { window.print(); }

  // ── Export (whole list) ───────────────────────────────────

  openExport(): void { this.showExportModal = true; }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    this.exporting = true;
    this.showExportModal = false;
    const fileName = `fee_report_${this.selectedTerm.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}`;
    try {
      if (format === 'csv')       this.exportCSV(fileName);
      else if (format === 'xlsx') this.exportXLSX(fileName);
      else                        this.exportPDFList(fileName);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exporting = false;
    }
  }

  // ── Export single student ─────────────────────────────────

  exportStudentPDF(summary: any, event: Event): void {
    event.stopPropagation();
    const name = this.getStudentName(summary.student).replace(/\s+/g, '_');
    const fileName = `fee_report_${name}_${this.selectedTerm.replace(' ', '_')}`;
    this.exportSinglePDF(summary, fileName);
  }

  private async exportSinglePDF(summary: any, fileName: string) {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();

    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pw, 28, 'F');
    if (branding.logoBase64) {
      try {
        doc.addImage(branding.logoBase64, branding.logoMimeType.replace('image/', '').toUpperCase(), 14, 4, 18, 18);
      } catch { /* logo render failed */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 12);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Outstanding Fee Report', 14, 20);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), pw - 14, 20, { align: 'right' });

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(this.getStudentName(summary.student), 14, 42);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Student No: ${summary.student?.student_number || '—'}`, 14, 49);
    doc.text(`Class: ${summary.student?.class?.name || '—'}`, 14, 55);
    doc.text(`${this.selectedTerm}  |  ${this.selectedYear}`, 14, 61);

    const boxes = [
      { label: 'Total Due', value: this.formatCurrencyPDF(summary.totalDue), color: [238, 242, 255] as [number,number,number], text: [79, 70, 229] as [number,number,number] },
      { label: 'Total Paid', value: this.formatCurrencyPDF(summary.totalPaid), color: [209, 250, 229] as [number,number,number], text: [6, 95, 70] as [number,number,number] },
      { label: 'Balance', value: this.formatCurrencyPDF(summary.totalBalance), color: [254, 226, 226] as [number,number,number], text: [153, 27, 27] as [number,number,number] },
    ];
    const bw = (pw - 28 - 12) / 3;
    boxes.forEach((b, i) => {
      const x = 14 + i * (bw + 6);
      doc.setFillColor(...b.color); doc.roundedRect(x, 68, bw, 22, 3, 3, 'F');
      doc.setTextColor(...b.text);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(b.label, x + 8, 76);
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(b.value, x + 8, 85);
    });

    // Fee breakdown table
    autoTable(doc, {
      startY: 98,
      head: [['Fee Name', 'Amount Due', 'Amount Paid', 'Balance', 'Status']],
      body: summary.fees.map((f: any) => [
        f.fee_name,
        this.formatCurrencyPDF(f.amount_due),
        this.formatCurrencyPDF(f.amount_paid),
        this.formatCurrencyPDF(f.amount_due - f.amount_paid),
        f.status.charAt(0).toUpperCase() + f.status.slice(1),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    doc.setFontSize(8); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
    doc.text(`${branding.name}  •  Generated automatically`, pw / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });

    this.triggerDownload(new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), `${fileName}.pdf`);
  }

  // ── Bulk export helpers ───────────────────────────────────

  private exportCSV(fileName: string): void {
    const summaries = this.studentSummaries;
    const esc = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = ['#', 'Student Name', 'Student No.', 'Class', 'Total Due (GHS)', 'Total Paid (GHS)', 'Balance (GHS)'];
    const rows = summaries.map((s, i) => [
      i + 1, esc(this.getStudentName(s.student)), esc(s.student?.student_number),
      esc(s.student?.class?.name), esc(s.totalDue.toFixed(2)), esc(s.totalPaid.toFixed(2)), esc(s.totalBalance.toFixed(2)),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    this.triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileName}.csv`);
  }

  private exportXLSX(fileName: string): void {
    const summaries = this.studentSummaries;
    const rows = summaries.map((s, i) => ({
      '#': i + 1, 'Student Name': this.getStudentName(s.student),
      'Student No.': s.student?.student_number || '', 'Class': s.student?.class?.name || '',
      'Total Due (GHS)': Number(s.totalDue.toFixed(2)), 'Total Paid (GHS)': Number(s.totalPaid.toFixed(2)),
      'Balance (GHS)': Number(s.totalBalance.toFixed(2)),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 4 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Report');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Info: 'Term', Value: this.selectedTerm }, { Info: 'Year', Value: this.selectedYear },
      { Info: 'Students', Value: summaries.length },
      { Info: 'Grand Due (GHS)', Value: this.grandTotalDue.toFixed(2) },
      { Info: 'Grand Paid (GHS)', Value: this.grandTotalPaid.toFixed(2) },
      { Info: 'Grand Balance (GHS)', Value: this.grandTotalBalance.toFixed(2) },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ]), 'Summary');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`);
  }

  private async exportPDFList(fileName: string){
    const branding = await this.pdfBranding.getBranding();
    const summaries = this.studentSummaries;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.setFillColor(79, 70, 229); doc.rect(0, 0, pw, 22, 'F');
    if (branding.logoBase64) {
      try {
        doc.addImage(branding.logoBase64, branding.logoMimeType.replace('image/', '').toUpperCase(), 14, 4, 18, 18);
      } catch { /* logo render failed */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(branding.name, 36, 14);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text(`Fee Outstanding Report — ${this.selectedTerm} ${this.selectedYear}`, pw / 2, 14, { align: 'center' });
    doc.setFontSize(9); doc.text(`Exported: ${today}`, pw - 14, 14, { align: 'right' });

    doc.setFillColor(238, 242, 255); doc.rect(0, 22, pw, 16, 'F');
    doc.setTextColor(79, 70, 229); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    const stats = [
      `Students: ${summaries.length}`,
      `Grand Due: ${this.formatCurrencyPDF(this.grandTotalDue)}`,
      `Grand Paid: ${this.formatCurrencyPDF(this.grandTotalPaid)}`,
      `Outstanding: ${this.formatCurrencyPDF(this.grandTotalBalance)}`,
    ];
    const cw = pw / stats.length;
    stats.forEach((s, i) => doc.text(s, cw * i + cw / 2, 32, { align: 'center' }));

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Student Name', 'Student No.', 'Class', 'Total Due', 'Total Paid', 'Balance']],
      body: [
        ...summaries.map((s, i) => [
          i + 1, this.getStudentName(s.student), s.student?.student_number || '—',
          s.student?.class?.name || '—',
          this.formatCurrencyPDF(s.totalDue), this.formatCurrencyPDF(s.totalPaid), this.formatCurrencyPDF(s.totalBalance),
        ]),
        // Grand total row
        ['', 'GRAND TOTAL', '', '', this.formatCurrencyPDF(this.grandTotalDue), this.formatCurrencyPDF(this.grandTotalPaid), this.formatCurrencyPDF(this.grandTotalBalance)],
      ],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', textColor: [220, 38, 38] },
      },
      didDrawPage: (data) => {
        const count = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
        doc.text(`Page ${data.pageNumber} of ${count}  •  ${branding.name}`, pw / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
      },
    });

    this.triggerDownload(new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), `${fileName}.pdf`);
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  getStudentName(student: any): string {
    if (!student) return '—';
    return `${student.first_name} ${student.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  }

  private formatCurrencyPDF(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      currencyDisplay: 'code',
    }).format(amount || 0);
  }
}


