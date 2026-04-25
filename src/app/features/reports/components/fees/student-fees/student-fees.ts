import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  SchoolClass,
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../../models/school.model';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';
import { SchoolFilterService } from '../../../services/school-filter.service';

@Component({
  selector: 'app-student-fees',
  standalone: false,
  templateUrl: './student-fees.html',
  styleUrl: './student-fees.scss',
})
export class StudentFees implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Full unfiltered list from the backend
  allStudentSummaries: any[] = [];

  // Displayed (filtered + sorted) list
  studentSummaries: any[] = [];

  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';

  selectedTerm = '';
  selectedYear = currentAcademicYear();
  selectedClassId = '';
  terms = TERMS;
  academicYears: string[] = generateAcademicYears();

  // ── Search ─────────────────────────────────────────────────
  searchControl = new FormControl('');
  searchTerm = '';

  // ── Sort ───────────────────────────────────────────────────
  sortOrder: 'name_asc' | 'name_desc' = 'name_asc';

  showExportModal = false;
  exporting = false;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private pdfBranding: PdfBrandingService,
    private schoolFilter: SchoolFilterService,
  ) {}

  ngOnInit(): void {
    this.selectedTerm = this.schoolFilter.term;
    this.selectedYear = this.schoolFilter.year;
    this.loadClasses();
    this.loadFees();

    // Debounce search input
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {
        this.searchTerm = (value || '').trim().toLowerCase();
        this.applyFilterAndSort();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadFees(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getOutstandingFees(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          const filtered = this.selectedClassId
            ? fees.filter(
                (f: any) => f.student?.class_id === this.selectedClassId,
              )
            : fees;

          const map: { [key: string]: any } = {};
          filtered.forEach((fee: any) => {
            const sid = fee.student_id;
            if (!map[sid]) {
              map[sid] = {
                student: fee.student,
                totalDue: 0,
                totalPaid: 0,
                totalBalance: 0,
                status: 'paid',
              };
            }
            map[sid].totalDue += Number(fee.amount_due);
            map[sid].totalPaid += Number(fee.amount_paid);
            map[sid].totalBalance +=
              Number(fee.amount_due) - Number(fee.amount_paid);

            if (fee.status === 'unpaid') map[sid].status = 'unpaid';
            else if (fee.status === 'partial' && map[sid].status !== 'unpaid')
              map[sid].status = 'partial';
          });

          this.allStudentSummaries = Object.values(map);
          this.applyFilterAndSort();
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.schoolFilter.setBoth(this.selectedTerm, this.selectedYear);
    this.loadFees();
  }

  // ── Search + Sort ────────────────────────────────────────

  setSortOrder(order: 'name_asc' | 'name_desc'): void {
    this.sortOrder = order;
    this.applyFilterAndSort();
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  private applyFilterAndSort(): void {
    let list = [...this.allStudentSummaries];

    // Search by name or student number
    if (this.searchTerm) {
      list = list.filter((s) => {
        const name = this.getStudentName(s.student).toLowerCase();
        const number = (s.student?.student_number || '').toLowerCase();
        return (
          name.includes(this.searchTerm) || number.includes(this.searchTerm)
        );
      });
    }

    // Sort by first name (matches StudentsList behaviour)
    list.sort((a, b) => {
      const aName = (a.student?.first_name || '').toLowerCase();
      const bName = (b.student?.first_name || '').toLowerCase();
      const cmp = aName.localeCompare(bName);
      return this.sortOrder === 'name_asc' ? cmp : -cmp;
    });

    this.studentSummaries = list;
  }

  get hasActiveFilters(): boolean {
    return !!this.searchTerm || this.sortOrder !== 'name_asc';
  }

  clearAllFilters(): void {
    this.searchControl.setValue('');
    this.sortOrder = 'name_asc';
    this.applyFilterAndSort();
  }

  // ── Navigation ───────────────────────────────────────────

  viewStudent(studentId: string): void {
    this.router.navigate(['main/reports/students', studentId]);
  }

  recordPayment(studentId: string): void {
    this.router.navigate(['main/reports/fees/record', studentId]);
  }

  // ── Export (unchanged) ───────────────────────────────────

  openExport(): void {
    this.showExportModal = true;
  }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    this.exporting = true;
    this.showExportModal = false;
    const today = new Date().toISOString().split('T')[0];
    const fileName = `student_fees_${this.selectedTerm.replace(' ', '_')}_${today}`;
    try {
      if (format === 'csv') this.exportCSV(this.studentSummaries, fileName);
      else if (format === 'xlsx')
        this.exportXLSX(this.studentSummaries, fileName);
      else this.exportPDF(this.studentSummaries, fileName);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exporting = false;
    }
  }

  exportStudentPDF(summary: any, event: Event): void {
    event.stopPropagation();
    const name = this.getStudentName(summary.student).replace(/\s+/g, '_');
    const fileName = `fee_statement_${name}_${this.selectedTerm.replace(' ', '_')}`;
    this.exportSingleStudentPDF(summary, fileName);
  }

  private async exportSingleStudentPDF(summary: any, fileName: string) {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 28, 'F');
    if (branding.logoBase64) {
      try {
        doc.addImage(
          branding.logoBase64,
          branding.logoMimeType.replace('image/', '').toUpperCase(),
          14,
          4,
          18,
          18,
        );
      } catch {
        /* skip */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Fee Statement', 14, 20);
    doc.setFontSize(9);
    doc.text(
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
      pageWidth - 14,
      20,
      { align: 'right' },
    );

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.getStudentName(summary.student), 14, 42);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Student No: ${summary.student?.student_number || '—'}`, 14, 49);
    doc.text(`Class: ${summary.student?.class?.name || '—'}`, 14, 55);
    doc.text(
      `Term: ${this.selectedTerm}  |  Year: ${this.selectedYear}`,
      14,
      61,
    );

    const boxes = [
      {
        label: 'Total Due',
        value: this.formatCurrencyPDF(summary.totalDue),
        color: [238, 242, 255] as [number, number, number],
        text: [79, 70, 229] as [number, number, number],
      },
      {
        label: 'Total Paid',
        value: this.formatCurrencyPDF(summary.totalPaid),
        color: [209, 250, 229] as [number, number, number],
        text: [6, 95, 70] as [number, number, number],
      },
      {
        label: 'Balance',
        value: this.formatCurrencyPDF(summary.totalBalance),
        color: [254, 226, 226] as [number, number, number],
        text: [153, 27, 27] as [number, number, number],
      },
    ];
    const bw = (pageWidth - 28 - 12) / 3;
    boxes.forEach((b, i) => {
      const x = 14 + i * (bw + 6);
      doc.setFillColor(...b.color);
      doc.roundedRect(x, 68, bw, 22, 3, 3, 'F');
      doc.setTextColor(...b.text);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(b.label, x + 8, 76);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(b.value, x + 8, 85);
    });

    const statusColors: Record<string, [number, number, number]> = {
      paid: [6, 95, 70],
      partial: [146, 64, 14],
      unpaid: [153, 27, 27],
    };
    const statusBg: Record<string, [number, number, number]> = {
      paid: [209, 250, 229],
      partial: [254, 243, 199],
      unpaid: [254, 226, 226],
    };
    const st = summary.status || 'unpaid';
    doc.setFillColor(...(statusBg[st] || statusBg['unpaid']));
    doc.roundedRect(pageWidth - 50, 68, 36, 12, 3, 3, 'F');
    doc.setTextColor(...(statusColors[st] || statusColors['unpaid']));
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(st.charAt(0).toUpperCase() + st.slice(1), pageWidth - 32, 76, {
      align: 'center',
    });

    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${branding.name}  •  Generated automatically`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    );

    this.triggerDownload(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  private exportCSV(summaries: any[], fileName: string): void {
    const headers = [
      'Student Name',
      'Student No.',
      'Class',
      'Total Due (GHS)',
      'Total Paid (GHS)',
      'Balance (GHS)',
      'Status',
    ];
    const esc = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const rows = summaries.map((s) => [
      esc(this.getStudentName(s.student)),
      esc(s.student?.student_number),
      esc(s.student?.class?.name),
      esc(s.totalDue.toFixed(2)),
      esc(s.totalPaid.toFixed(2)),
      esc(s.totalBalance.toFixed(2)),
      esc(s.status),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${fileName}.csv`,
    );
  }

  private exportXLSX(summaries: any[], fileName: string): void {
    const rows = summaries.map((s, i) => ({
      '#': i + 1,
      'Student Name': this.getStudentName(s.student),
      'Student No.': s.student?.student_number || '',
      Class: s.student?.class?.name || '',
      'Total Due (GHS)': Number(s.totalDue.toFixed(2)),
      'Total Paid (GHS)': Number(s.totalPaid.toFixed(2)),
      'Balance (GHS)': Number(s.totalBalance.toFixed(2)),
      Status: s.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 4 },
      { wch: 24 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Fees');

    const totals = summaries.reduce(
      (acc, s) => {
        acc.due += s.totalDue;
        acc.paid += s.totalPaid;
        acc.bal += s.totalBalance;
        return acc;
      },
      { due: 0, paid: 0, bal: 0 },
    );
    const summaryWs = XLSX.utils.json_to_sheet([
      { Info: 'Term', Value: this.selectedTerm },
      { Info: 'Academic Year', Value: this.selectedYear },
      { Info: 'Students with Balance', Value: summaries.length },
      { Info: 'Grand Total Due (GHS)', Value: totals.due.toFixed(2) },
      { Info: 'Grand Total Paid (GHS)', Value: totals.paid.toFixed(2) },
      { Info: 'Grand Balance (GHS)', Value: totals.bal.toFixed(2) },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ]);
    summaryWs['!cols'] = [{ wch: 24 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.triggerDownload(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private async exportPDF(summaries: any[], fileName: string) {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 22, 'F');
    if (branding.logoBase64) {
      try {
        doc.addImage(
          branding.logoBase64,
          branding.logoMimeType.replace('image/', '').toUpperCase(),
          14,
          4,
          18,
          18,
        );
      } catch {
        /* skip */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Student Fees — ${this.selectedTerm} ${this.selectedYear}`,
      pageWidth / 2,
      14,
      { align: 'center' },
    );
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    const totals = summaries.reduce(
      (acc, s) => {
        acc.due += s.totalDue;
        acc.paid += s.totalPaid;
        acc.bal += s.totalBalance;
        return acc;
      },
      { due: 0, paid: 0, bal: 0 },
    );
    doc.setFillColor(238, 242, 255);
    doc.rect(0, 22, pageWidth, 16, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const stats = [
      `Students: ${summaries.length}`,
      `Total Due: ${this.formatCurrencyPDF(totals.due)}`,
      `Total Paid: ${this.formatCurrencyPDF(totals.paid)}`,
      `Outstanding: ${this.formatCurrencyPDF(totals.bal)}`,
    ];
    const cw = pageWidth / stats.length;
    stats.forEach((s, i) =>
      doc.text(s, cw * i + cw / 2, 32, { align: 'center' }),
    );

    autoTable(doc, {
      startY: 42,
      head: [
        [
          '#',
          'Student Name',
          'Student No.',
          'Class',
          'Total Due',
          'Total Paid',
          'Balance',
          'Status',
        ],
      ],
      body: summaries.map((s, i) => [
        i + 1,
        this.getStudentName(s.student),
        s.student?.student_number || '—',
        s.student?.class?.name || '—',
        this.formatCurrencyPDF(s.totalDue),
        this.formatCurrencyPDF(s.totalPaid),
        this.formatCurrencyPDF(s.totalBalance),
        s.status.charAt(0).toUpperCase() + s.status.slice(1),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      didDrawPage: (data) => {
        const count = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${count}  •  ${branding.name}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      },
    });

    this.triggerDownload(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // ── Helpers ──────────────────────────────────────────────

  getStudentName(student: any): string {
    if (!student) return '—';
    return `${student.first_name} ${student.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  private formatCurrencyPDF(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      currencyDisplay: 'code',
    }).format(amount || 0);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      paid: 'status-paid',
      partial: 'status-partial',
      unpaid: 'status-unpaid',
    };
    return map[status] || '';
  }
}
