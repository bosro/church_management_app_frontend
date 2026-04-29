import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  Student,
  SchoolClass,
  currentAcademicYear,
  generateAcademicYears,
  TERMS,
} from '../../../../../models/school.model';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';
import { ClassFeeExportService } from '../../../services/class-fee-export.service';
import { Location } from '@angular/common';
import { SchoolFilterService } from '../../../services/school-filter.service';

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
  get totalPages() {
    return Math.ceil(this.totalStudents / this.pageSize);
  }

  filterForm!: FormGroup;
  terms = TERMS;
  academicYears = generateAcademicYears();

  // ── Sort ──────────────────────────────────────────────────
  sortOrder: 'name_asc' | 'name_desc' | 'created_at_desc' = 'name_asc';

  // Fee data per student
  feeTerm = '';
  feeYear = currentAcademicYear();
  feeDataMap: Map<string, any> = new Map();

  // ── Bulk Selection ────────────────────────────────────────
  selectedStudentIds = new Set<string>();
  get allSelected(): boolean {
    return (
      this.students.length > 0 &&
      this.students.every((s) => this.selectedStudentIds.has(s.id))
    );
  }
  get someSelected(): boolean {
    return this.selectedStudentIds.size > 0 && !this.allSelected;
  }

  // ── Bulk Delete / Duplicates ──────────────────────────────
  showBulkDeleteConfirm = false;
  showDuplicateConfirm = false;
  bulkDeleting = false;
  deduplicating = false;
  duplicateStats: { groups: number; toDelete: number } | null = null;
  loadingDuplicateStats = false;

  // ── Modals ────────────────────────────────────────────────
  showExportModal = false;
  showBrandingModal = false;

  // ── Print ─────────────────────────────────────────────────
  printStatements: any[] = [];
  printBrandingName = '';

  // ── Class filter label (shown when coming from class card) ─
  activeClassFilter: SchoolClass | null = null;

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private route: ActivatedRoute,
    private classFeeExport: ClassFeeExportService,
    private pdfBranding: PdfBrandingService,
    private location: Location,
    private schoolFilter: SchoolFilterService,
  ) {}

  ngOnInit(): void {
    this.feeTerm = this.schoolFilter.term;
    this.feeYear = this.schoolFilter.year;

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

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        if (params['classId']) {
          this.filterForm.patchValue(
            { classId: params['classId'] },
            { emitEvent: false },
          );
        }
        this.loadStudents();
      });

    if (this.permissionService.school?.fees) {
      this.loadFeeData();
    }

    if (this.permissionService.isAdmin) {
      this.loadDuplicateStats();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => {
          this.classes = c;
          this.resolveActiveClassLabel();
        },
      });
  }

  private resolveActiveClassLabel(): void {
    const classId = this.filterForm.value.classId;
    if (classId && this.classes.length) {
      this.activeClassFilter =
        this.classes.find((c) => c.id === classId) || null;
    } else {
      this.activeClassFilter = null;
    }
  }

  // ── Sort ──────────────────────────────────────────────────

  setSortOrder(order: 'name_asc' | 'name_desc' | 'created_at_desc'): void {
    this.sortOrder = order;
    this.currentPage = 1;
    this.loadStudents();
  }

  // ── Load ──────────────────────────────────────────────────

  loadStudents(): void {
    this.loading = true;
    this.resolveActiveClassLabel();
    const { search, classId, isActive } = this.filterForm.value;

    this.schoolService
      .getStudents(
        {
          search: search || undefined,
          classId: classId || undefined,
          isActive: isActive === '' ? undefined : isActive === 'true',
          sortBy: this.sortOrder,
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
          if (this.permissionService.school?.fees) {
            this.loadFeeData();
          }
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load students';
          this.loading = false;
        },
      });
  }

  // ── Fee data ─────────────────────────────────────────────

  loadFeeData(): void {
    if (this.students.length === 0) return;
    const studentIds = this.students.map((s) => s.id);

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
              map[sid] = {
                totalDue: 0,
                totalPaid: 0,
                totalBalance: 0,
                status: 'paid',
                fees: [],
              };
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
        error: () => {
          /* non-critical */
        },
      });
  }

  getStudentFeeData(studentId: string): any {
    return this.feeDataMap.get(studentId) || null;
  }

  onFeeFilterChange(): void {
    this.schoolFilter.setBoth(this.feeTerm, this.feeYear);
    this.loadFeeData();
  }

  // ── Bulk Selection ────────────────────────────────────────

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked)
      this.students.forEach((s) => this.selectedStudentIds.add(s.id));
    else this.students.forEach((s) => this.selectedStudentIds.delete(s.id));
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

  get selectedCount(): number {
    return this.selectedStudentIds.size;
  }

  // ── Bulk Delete ───────────────────────────────────────────

  openBulkDeleteConfirm(): void {
    if (this.selectedStudentIds.size === 0) return;
    this.showBulkDeleteConfirm = true;
  }

  closeBulkDeleteConfirm(): void {
    if (!this.bulkDeleting) this.showBulkDeleteConfirm = false;
  }

  executeBulkDelete(): void {
    const ids = Array.from(this.selectedStudentIds);
    this.bulkDeleting = true;

    this.schoolService
      .bulkDeleteStudents(ids)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.bulkDeleting = false;
          this.showBulkDeleteConfirm = false;
          this.clearSelection();
          this.successMessage = `Deleted ${result.deleted} student${result.deleted !== 1 ? 's' : ''} successfully.`;
          if (result.errors.length > 0) {
            this.errorMessage = `${result.errors.length} student(s) could not be deleted.`;
          }
          this.loadStudents();
          this.loadDuplicateStats();
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => {
          this.bulkDeleting = false;
          this.errorMessage =
            'Bulk delete failed: ' + (err.message || 'Unknown error');
        },
      });
  }

  // ── Duplicate Detection ───────────────────────────────────

  loadDuplicateStats(): void {
    this.loadingDuplicateStats = true;
    this.schoolService
      .getStudentDuplicateStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.duplicateStats = stats;
          this.loadingDuplicateStats = false;
        },
        error: () => {
          this.loadingDuplicateStats = false;
        },
      });
  }

  openDuplicateConfirm(): void {
    if (!this.duplicateStats || this.duplicateStats.toDelete === 0) return;
    this.showDuplicateConfirm = true;
  }

  closeDuplicateConfirm(): void {
    if (!this.deduplicating) this.showDuplicateConfirm = false;
  }

  executeDeduplication(): void {
    this.deduplicating = true;
    this.schoolService
      .deleteStudentDuplicates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.deduplicating = false;
          this.showDuplicateConfirm = false;
          this.duplicateStats = { groups: 0, toDelete: 0 };
          this.successMessage = `Removed ${result.deleted} duplicate record${result.deleted !== 1 ? 's' : ''} across ${result.groups} group${result.groups !== 1 ? 's' : ''}.`;
          this.loadStudents();
          setTimeout(() => (this.successMessage = ''), 5000);
        },
        error: (err) => {
          this.deduplicating = false;
          this.errorMessage =
            'Failed to remove duplicates: ' + (err.message || 'Unknown error');
        },
      });
  }

  // ── Export selected as PDF ────────────────────────────────

  async exportSelected(): Promise<void> {
    if (this.selectedStudentIds.size === 0) return;
    this.exporting = true;
    try {
      const branding = await this.pdfBranding.getBranding();
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pw = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      let isFirst = true;

      for (const studentId of this.selectedStudentIds) {
        const student = this.students.find((s) => s.id === studentId);
        const fd = this.feeDataMap.get(studentId);
        if (!student) continue;

        if (!isFirst) doc.addPage();
        isFirst = false;

        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, pw, 28, 'F');
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
          } catch {}
        }
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(branding.name, 36, 13);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Student Fee Statement', 36, 21);
        doc.setFontSize(8);
        doc.text(today, pw - 14, 21, { align: 'right' });

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 34, pw - 28, 30, 3, 3, 'F');
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(this.getFullName(student), 20, 43);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(`Student No: ${student.student_number}`, 20, 50);
        doc.text(`Class: ${student.class?.name || '—'}`, 20, 56);
        doc.text(`${this.feeTerm}  |  ${this.feeYear}`, 20, 62);

        if (fd) {
          const statusBg: Record<string, [number, number, number]> = {
            paid: [209, 250, 229],
            partial: [254, 243, 199],
            unpaid: [254, 226, 226],
          };
          const statusColors: Record<string, [number, number, number]> = {
            paid: [6, 95, 70],
            partial: [146, 64, 14],
            unpaid: [153, 27, 27],
          };
          const st = fd.status || 'unpaid';
          doc.setFillColor(...(statusBg[st] || statusBg['unpaid']));
          doc.roundedRect(pw - 52, 36, 38, 12, 3, 3, 'F');
          doc.setTextColor(...(statusColors[st] || statusColors['unpaid']));
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(st.charAt(0).toUpperCase() + st.slice(1), pw - 33, 44, {
            align: 'center',
          });

          const boxes = [
            {
              label: 'Total Due',
              value: this.fmtPDF(fd.totalDue),
              color: [238, 242, 255] as [number, number, number],
              text: [79, 70, 229] as [number, number, number],
            },
            {
              label: 'Total Paid',
              value: this.fmtPDF(fd.totalPaid),
              color: [209, 250, 229] as [number, number, number],
              text: [6, 95, 70] as [number, number, number],
            },
            {
              label: 'Balance',
              value: this.fmtPDF(fd.totalBalance),
              color:
                fd.totalBalance > 0
                  ? ([254, 226, 226] as [number, number, number])
                  : ([209, 250, 229] as [number, number, number]),
              text:
                fd.totalBalance > 0
                  ? ([153, 27, 27] as [number, number, number])
                  : ([6, 95, 70] as [number, number, number]),
            },
          ];
          const bw = (pw - 28 - 12) / 3;
          boxes.forEach((box, i) => {
            const x = 14 + i * (bw + 6);
            doc.setFillColor(...box.color);
            doc.roundedRect(x, 70, bw, 22, 3, 3, 'F');
            doc.setTextColor(...box.text);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(box.label, x + bw / 2, 78, { align: 'center' });
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(box.value, x + bw / 2, 87, { align: 'center' });
          });

          autoTable(doc, {
            startY: 100,
            head: [
              ['Fee Item', 'Amount Due', 'Amount Paid', 'Balance', 'Status'],
            ],
            body:
              fd.fees.length > 0
                ? fd.fees.map((f: any) => [
                    f.feeName,
                    this.fmtPDF(f.amountDue),
                    this.fmtPDF(f.amountPaid),
                    this.fmtPDF(f.balance),
                    f.status.charAt(0).toUpperCase() + f.status.slice(1),
                  ])
                : [['No fees assigned', '', '', '', '']],
            foot:
              fd.fees.length > 0
                ? [
                    [
                      'TOTAL',
                      this.fmtPDF(fd.totalDue),
                      this.fmtPDF(fd.totalPaid),
                      this.fmtPDF(fd.totalBalance),
                      '',
                    ],
                  ]
                : undefined,
            styles: { fontSize: 9, cellPadding: 3.5 },
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
            columnStyles: {
              1: { halign: 'right' },
              2: { halign: 'right' },
              3: {
                halign: 'right',
                textColor: [220, 38, 38] as [number, number, number],
              },
              4: { halign: 'center' },
            },
          });
        } else {
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(11);
          doc.text('No fee data available for this term.', pw / 2, 85, {
            align: 'center',
          });
        }

        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `${branding.name}${branding.address ? '  •  ' + branding.address : ''}${branding.phone ? '  •  ' + branding.phone : ''}`,
          pw / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' },
        );
        doc.text(
          'This is an official fee statement.',
          pw / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      }

      const blob = new Blob([doc.output('arraybuffer')], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee_statements_${this.feeTerm.replace(' ', '_')}_${this.feeYear.replace('/', '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    } finally {
      this.exporting = false;
    }
  }

  async printSelected(): Promise<void> {
    if (this.selectedStudentIds.size === 0) return;
    const branding = await this.pdfBranding.getBranding();
    this.printBrandingName = branding.name;
    this.printStatements = [];
    for (const studentId of this.selectedStudentIds) {
      const student = this.students.find((s) => s.id === studentId);
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
    setTimeout(() => window.print(), 300);
  }

  async exportStudentStatement(studentId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.classFeeExport.exportStudentPDF(
        studentId,
        this.feeYear,
        this.feeTerm,
      );
    } catch (e: any) {
      this.errorMessage = 'Export failed: ' + e.message;
    }
  }

  // ── Navigation ────────────────────────────────────────────

  viewStudent(id: string): void {
    this.router.navigate(['main/reports/students', id], {
      queryParams: {
        term: this.feeTerm,
        year: this.feeYear,
      },
    });
  }

  addStudent(): void {
    this.router.navigate(['main/reports/students/add']);
  }

  editStudent(id: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/reports/students', id, 'edit']);
  }

  clearClassFilter(): void {
    this.filterForm.patchValue({ classId: '' });
    this.router.navigate(['main/reports/students']);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadStudents();
    }
  }
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadStudents();
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ search: '', classId: '', isActive: 'true' });
    this.sortOrder = 'name_asc';
    this.router.navigate(['main/reports/students']);
  }

  openExport(): void {
    this.showExportModal = true;
  }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
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
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  private fmtPDF(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      currencyDisplay: 'code',
    }).format(amount || 0);
  }

  back() {
    this.location.back();
  }
}



