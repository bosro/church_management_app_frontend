import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  FeeStructure,
  SchoolClass,
  TERMS,
} from '../../../../../models/school.model';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';
import { ClassFeeExportService } from '../../../services/class-fee-export.service';

@Component({
  selector: 'app-fee-structures',
  standalone: false,
  templateUrl: './fee-structures.html',
  styleUrl: './fee-structures.scss',
})
export class FeeStructures implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  feeStructures: FeeStructure[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  selectedClassId = '';
  selectedTerm = TERMS[0];
  selectedYear = '';
  terms = TERMS;
  academicYears: string[] = [];

  showModal = false;
  editingFee: FeeStructure | null = null;
  processing = false;

  showExportModal = false;
  exporting = false;

  showDeleteModal = false;
  feeToDelete: FeeStructure | null = null;

  showAssignModal = false;
  classToAssign: { id: string; name: string } | null = null;

  showBrandingModal = false;
  showClassExportModal = false;
  exportingClass = false;
  classExportTarget: { id: string; name: string } | null = null;

  feeForm = {
    class_id: '',
    fee_name: '',
    amount: 0,
    is_mandatory: true,
    academic_year: '',
    term: TERMS[0],
  };

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private pdfBranding: PdfBrandingService,
    private classFeeExport: ClassFeeExportService,
  ) {}

  ngOnInit(): void {
    const year = new Date().getFullYear();
    this.selectedYear = `${year}/${year + 1}`;
    this.academicYears = [`${year}/${year + 1}`, `${year - 1}/${year}`];
    this.loadClasses();
    this.loadFeeStructures();
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

  loadFeeStructures(): void {
    this.loading = true;
    this.errorMessage = '';
    this.schoolService
      .getAllFeeStructures(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.feeStructures = this.selectedClassId
            ? fees.filter((f) => f.class_id === this.selectedClassId)
            : fees;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load fee structures';
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.loadFeeStructures();
  }

  get groupedFees(): { class: SchoolClass; fees: FeeStructure[] }[] {
    const groups: { [key: string]: FeeStructure[] } = {};
    this.feeStructures.forEach((f) => {
      if (!groups[f.class_id]) groups[f.class_id] = [];
      groups[f.class_id].push(f);
    });
    return Object.keys(groups).map((classId) => ({
      class: groups[classId][0].class || ({ name: 'Unknown' } as SchoolClass),
      fees: groups[classId],
    }));
  }

  getClassTotal(fees: FeeStructure[]): number {
    return fees.reduce((s, f) => s + Number(f.amount), 0);
  }

  // ── Modal ────────────────────────────────────────────────

  openCreateModal(): void {
    this.editingFee = null;
    this.feeForm = {
      class_id: this.selectedClassId || '',
      fee_name: '',
      amount: 0,
      is_mandatory: true,
      academic_year: this.selectedYear,
      term: this.selectedTerm,
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  openEditModal(fee: FeeStructure): void {
    this.editingFee = fee;
    this.feeForm = {
      class_id: fee.class_id,
      fee_name: fee.fee_name,
      amount: fee.amount,
      is_mandatory: fee.is_mandatory,
      academic_year: fee.academic_year,
      term: fee.term,
    };
    this.showModal = true;
    this.errorMessage = '';
  }

  confirmDelete(fee: FeeStructure): void {
    this.feeToDelete = fee;
    this.showDeleteModal = true;
  }

  executeDelete(): void {
    if (!this.feeToDelete) return;
    this.processing = true;
    this.schoolService
      .deleteFeeStructure(this.feeToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Fee deleted!';
          this.processing = false;
          this.showDeleteModal = false;
          this.feeToDelete = null;
          this.loadFeeStructures();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete fee';
          this.processing = false;
        },
      });
  }

  closeModal(): void {
    this.showModal = false;
    this.editingFee = null;
  }

  openClassExport(classId: string, className: string): void {
    this.classExportTarget = { id: classId, name: className };
    this.showClassExportModal = true;
  }

  async exportClassAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    if (!this.classExportTarget) return;
    this.exportingClass = true;
    this.showClassExportModal = false;
    try {
      const data = await this.classFeeExport.fetchClassFeeData(
        this.classExportTarget.id,
        this.classExportTarget.name,
        this.selectedYear,
        this.selectedTerm,
      );
      if (format === 'pdf') await this.classFeeExport.exportClassPDF(data);
      else if (format === 'xlsx')
        await this.classFeeExport.exportClassXLSX(data);
      else this.classFeeExport.exportClassCSV(data);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exportingClass = false;
    }
  }

  async exportStudentStatement(studentId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.classFeeExport.exportStudentPDF(
        studentId,
        this.selectedYear,
        this.selectedTerm,
      );
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    }
  }

  saveFee(): void {
    if (
      !this.feeForm.class_id ||
      !this.feeForm.fee_name ||
      !this.feeForm.amount
    ) {
      this.errorMessage = 'Class, fee name and amount are required';
      return;
    }
    this.processing = true;
    this.errorMessage = '';

    const obs = this.editingFee
      ? this.schoolService.updateFeeStructure(this.editingFee.id, this.feeForm)
      : this.schoolService.createFeeStructure(this.feeForm);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = this.editingFee ? 'Fee updated!' : 'Fee created!';
        this.processing = false;
        this.closeModal();
        this.loadFeeStructures();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => {
        this.errorMessage = err.message || 'Failed to save fee';
        this.processing = false;
      },
    });
  }

  deleteFee(fee: FeeStructure): void {
    if (!confirm(`Delete "${fee.fee_name}" fee?`)) return;
    this.schoolService
      .deleteFeeStructure(fee.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Fee deleted!';
          this.loadFeeStructures();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete fee';
        },
      });
  }

  assignFeesToClass(classId: string): void {
    if (
      !confirm(
        'This will assign these fees to all active students in this class. Continue?',
      )
    )
      return;
    this.schoolService
      .assignFeesToClass(classId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Fees assigned to all students in class!';
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to assign fees';
        },
      });
  }

  // ── Export (full list) ────────────────────────────────────

  openExport(): void {
    this.showExportModal = true;
  }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    this.exporting = true;
    this.showExportModal = false;
    const fileName = `fee_structures_${this.selectedTerm.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}`;
    try {
      if (format === 'csv') this.exportCSV(this.groupedFees, fileName);
      else if (format === 'xlsx') this.exportXLSX(this.groupedFees, fileName);
      else await this.exportPDFAll(this.groupedFees, fileName);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exporting = false;
    }
  }

  // ── Export single class ───────────────────────────────────

  exportClassPDF(
    group: { class: SchoolClass; fees: FeeStructure[] },
    event: Event,
  ): void {
    event.stopPropagation();
    const fileName = `fee_structure_${group.class.name.replace(/\s+/g, '_')}_${this.selectedTerm.replace(' ', '_')}`;
    this.exportSingleClassPDF(group, fileName);
  }

  private async exportSingleClassPDF(
    group: { class: SchoolClass; fees: FeeStructure[] },
    fileName: string,
  ): Promise<void> {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pw = doc.internal.pageSize.getWidth();

    // Header banner
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pw, 28, 'F');

    // Logo
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
        /* logo render failed — skip */
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Fee Structure', 36, 20);
    doc.setFontSize(9);
    doc.text(
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
      pw - 14,
      20,
      { align: 'right' },
    );

    // Class name + term
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(group.class.name, 14, 42);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`${this.selectedTerm}  |  ${this.selectedYear}`, 14, 50);

    // Total box
    const total = this.getClassTotal(group.fees);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(pw - 70, 36, 56, 18, 3, 3, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Fees', pw - 42, 43, { align: 'center' });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(this.formatCurrencyPDF(total), pw - 42, 51, { align: 'center' });

    autoTable(doc, {
      startY: 60,
      head: [['Fee Name', 'Amount (GHS)', 'Mandatory']],
      body: group.fees.map((f) => [
        f.fee_name,
        this.formatCurrencyPDF(f.amount),
        f.is_mandatory ? 'Yes' : 'No',
      ]),
      foot: [['TOTAL', this.formatCurrencyPDF(total), '']],
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [255, 247, 237],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } },
    });

    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${branding.name}  •  Generated automatically`,
      pw / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    );

    this.triggerDownload(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  // ── Bulk export helpers ───────────────────────────────────

  private exportCSV(
    groups: { class: SchoolClass; fees: FeeStructure[] }[],
    fileName: string,
  ): void {
    const esc = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const headers = [
      'Class',
      'Fee Name',
      'Amount (GHS)',
      'Mandatory',
      'Term',
      'Academic Year',
    ];
    const rows = groups.flatMap((g) =>
      g.fees.map((f) => [
        esc(g.class.name),
        esc(f.fee_name),
        esc(Number(f.amount).toFixed(2)),
        esc(f.is_mandatory ? 'Yes' : 'No'),
        esc(f.term),
        esc(f.academic_year),
      ]),
    );
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${fileName}.csv`,
    );
  }

  private exportXLSX(
    groups: { class: SchoolClass; fees: FeeStructure[] }[],
    fileName: string,
  ): void {
    const rows = groups.flatMap((g) =>
      g.fees.map((f) => ({
        Class: g.class.name,
        'Fee Name': f.fee_name,
        'Amount (GHS)': Number(Number(f.amount).toFixed(2)),
        Mandatory: f.is_mandatory ? 'Yes' : 'No',
        Term: f.term,
        'Academic Year': f.academic_year,
      })),
    );

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Structures');

    const summaryRows = groups.map((g) => ({
      Class: g.class.name,
      'Number of Fees': g.fees.length,
      'Total (GHS)': Number(this.getClassTotal(g.fees).toFixed(2)),
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'By Class');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.triggerDownload(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private async exportPDFAll(
    groups: { class: SchoolClass; fees: FeeStructure[] }[],
    fileName: string,
  ): Promise<void> {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
    const pw = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Header banner
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pw, 22, 'F');

    // Logo
    if (branding.logoBase64) {
      try {
        doc.addImage(
          branding.logoBase64,
          branding.logoMimeType.replace('image/', '').toUpperCase(),
          14,
          3,
          16,
          16,
        );
      } catch {
        /* logo render failed — skip */
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Fee Structures — ${this.selectedTerm} ${this.selectedYear}`,
      pw / 2,
      14,
      { align: 'center' },
    );
    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pw - 14, 14, { align: 'right' });

    // Stats row
    const totalFees = groups.reduce((s, g) => s + g.fees.length, 0);
    const grandTotal = groups.reduce(
      (s, g) => s + this.getClassTotal(g.fees),
      0,
    );

    doc.setFillColor(238, 242, 255);
    doc.rect(0, 22, pw, 16, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const stats = [
      `Classes: ${groups.length}`,
      `Fee Items: ${totalFees}`,
      `Grand Total: ${this.formatCurrencyPDF(grandTotal)}`,
    ];
    const cw = pw / stats.length;
    stats.forEach((s, i) =>
      doc.text(s, cw * i + cw / 2, 32, { align: 'center' }),
    );

    autoTable(doc, {
      startY: 42,
      head: [['Fee Name', 'Amount', 'Mandatory', 'Term', 'Year']],
      body: groups.flatMap((g) => [
        [
          {
            content: g.class.name,
            colSpan: 5,
            styles: {
              fillColor: [238, 242, 255] as [number, number, number],
              textColor: [79, 70, 229] as [number, number, number],
              fontStyle: 'bold' as const,
            },
          },
        ] as any,
        ...g.fees.map((f) => [
          f.fee_name,
          this.formatCurrencyPDF(f.amount),
          f.is_mandatory ? 'Yes' : 'No',
          f.term,
          f.academic_year,
        ]),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } },
      didDrawPage: (data) => {
        const count = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${count}  •  ${branding.name}`,
          pw / 2,
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

  // ── Helpers ──────────────────────────────────────────────

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

  confirmAssign(classId: string, className: string): void {
    this.classToAssign = { id: classId, name: className };
    this.showAssignModal = true;
  }

  executeAssign(): void {
    if (!this.classToAssign) return;
    this.processing = true;
    this.schoolService
      .assignFeesToClass(
        this.classToAssign.id,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `Fees assigned to all students in ${this.classToAssign?.name}!`;
          this.processing = false;
          this.showAssignModal = false;
          this.classToAssign = null;
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to assign fees';
          this.processing = false;
          this.showAssignModal = false;
        },
      });
  }
}
