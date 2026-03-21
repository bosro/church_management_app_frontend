import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Student, SchoolClass } from '../../../../../models/school.model';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';

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
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalStudents = 0;
  totalPages = 0;

  // Filters
  filterForm!: FormGroup;

  // Export
  showExportModal = false;
  exporting = false;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private fb: FormBuilder,
    private pdfBranding: PdfBrandingService,
  ) {}

  ngOnInit(): void {
    this.initFilterForm();
    this.loadClasses();
    this.loadStudents();
    this.setupFilterListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initFilterForm(): void {
    this.filterForm = this.fb.group({
      search: [''],
      classId: [''],
      isActive: ['true'],
    });
  }

  private setupFilterListener(): void {
    this.filterForm.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadStudents();
      });
  }

  loadClasses(): void {
    this.schoolService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (classes) => (this.classes = classes),
        error: (err) => console.error(err),
      });
  }

  loadStudents(): void {
    this.loading = true;
    this.errorMessage = '';

    const values = this.filterForm.value;
    const filters = {
      search: values.search || undefined,
      classId: values.classId || undefined,
      isActive:
        values.isActive === 'true'
          ? true
          : values.isActive === 'false'
            ? false
            : undefined,
    };

    this.schoolService
      .getStudents(filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.students = data;
          this.totalStudents = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load students';
          this.loading = false;
        },
      });
  }

  // ── Navigation ───────────────────────────────────────────

  addStudent(): void {
    this.router.navigate(['main/reports/students/add']);
  }

  viewStudent(id: string): void {
    this.router.navigate(['main/reports/students', id]);
  }

  editStudent(id: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/reports/students', id, 'edit']);
  }

  // ── Pagination ───────────────────────────────────────────

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadStudents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadStudents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ search: '', classId: '', isActive: 'true' });
  }

  // ── Export ───────────────────────────────────────────────

  openExport(): void {
    this.showExportModal = true;
  }

  /** Load ALL students matching current filters (no pagination) for export */
  private async getAllStudentsForExport(): Promise<Student[]> {
    const values = this.filterForm.value;
    const filters = {
      search: values.search || undefined,
      classId: values.classId || undefined,
      isActive:
        values.isActive === 'true'
          ? true
          : values.isActive === 'false'
            ? false
            : undefined,
    };

    return new Promise((resolve, reject) => {
      this.schoolService
        .getStudents(filters, 1, 10000)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ({ data }) => resolve(data),
          error: reject,
        });
    });
  }

  async exportAs(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    this.exporting = true;
    this.showExportModal = false;

    try {
      const students = await this.getAllStudentsForExport();
      const today = new Date().toISOString().split('T')[0];
      const fileName = `students_export_${today}`;

      if (format === 'csv') {
        this.downloadCSV(students, fileName);
      } else if (format === 'xlsx') {
        this.downloadXLSX(students, fileName);
      } else {
        this.downloadPDF(students, fileName);
      }
    } catch (err: any) {
      this.errorMessage = 'Failed to export: ' + (err.message || 'Unknown error');
    } finally {
      this.exporting = false;
    }
  }

  private downloadCSV(students: Student[], fileName: string): void {
    const headers = [
      'Student Number',
      'First Name',
      'Middle Name',
      'Last Name',
      'Class',
      'Gender',
      'Date of Birth',
      'Parent/Guardian',
      'Parent Phone',
      'Parent Email',
      'Address',
      'Status',
    ];

    const escape = (v: string | undefined | null) => {
      if (!v) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = students.map((s) => [
      escape(s.student_number),
      escape(s.first_name),
      escape(s.middle_name),
      escape(s.last_name),
      escape(s.class?.name),
      escape(s.gender),
      escape(s.date_of_birth),
      escape(s.parent_name),
      escape(s.parent_phone),
      escape(s.parent_email),
      escape(s.address),
      escape(s.is_active ? 'Active' : 'Inactive'),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, `${fileName}.csv`);
  }

  private downloadXLSX(students: Student[], fileName: string): void {
    const rows = students.map((s) => ({
      'Student Number': s.student_number || '',
      'First Name': s.first_name,
      'Middle Name': s.middle_name || '',
      'Last Name': s.last_name,
      Class: s.class?.name || '',
      Gender: s.gender || '',
      'Date of Birth': s.date_of_birth || '',
      'Parent/Guardian': s.parent_name || '',
      'Parent Phone': s.parent_phone || '',
      'Parent Email': s.parent_email || '',
      Address: s.address || '',
      Status: s.is_active ? 'Active' : 'Inactive',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
      { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 10 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    // Summary sheet
    const active = students.filter((s) => s.is_active).length;
    const summaryData = [
      { Info: 'Total Students', Value: students.length },
      { Info: 'Active', Value: active },
      { Info: 'Inactive', Value: students.length - active },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    this.triggerDownload(blob, `${fileName}.xlsx`);
  }

  private async downloadPDF(students: Student[], fileName: string) {
    const branding = await this.pdfBranding.getBranding();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // Header banner
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 22, 'F');
    if (branding.logoBase64) {
      try {
        doc.addImage(branding.logoBase64, branding.logoMimeType.replace('image/', '').toUpperCase(), 14, 4, 18, 18);
      } catch { /* logo render failed */ }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(branding.name, 36, 14);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Students Report', pageWidth / 2, 14, { align: 'center' });

    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    // Stats row
    const active = students.filter((s) => s.is_active).length;
    const male = students.filter((s) => s.gender === 'male').length;
    const female = students.filter((s) => s.gender === 'female').length;

    doc.setFillColor(238, 242, 255);
    doc.rect(0, 22, pageWidth, 16, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');

    const stats = [
      `Total: ${students.length}`,
      `Active: ${active}`,
      `Inactive: ${students.length - active}`,
      `Male: ${male}`,
      `Female: ${female}`,
    ];
    const colW = pageWidth / stats.length;
    stats.forEach((stat, i) => {
      doc.text(stat, colW * i + colW / 2, 32, { align: 'center' });
    });

    autoTable(doc, {
      startY: 42,
      head: [['#', 'Student No.', 'First Name', 'Last Name', 'Class', 'Gender', 'Date of Birth', 'Parent/Guardian', 'Parent Phone', 'Status']],
      body: students.map((s, idx) => [
        idx + 1,
        s.student_number || '—',
        s.first_name,
        s.last_name,
        s.class?.name || '—',
        s.gender ? s.gender.charAt(0).toUpperCase() + s.gender.slice(1) : '—',
        s.date_of_birth || '—',
        s.parent_name || '—',
        s.parent_phone || '—',
        s.is_active ? 'Active' : 'Inactive',
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 18 },
        5: { cellWidth: 14 },
        6: { cellWidth: 22 },
        7: { cellWidth: 28 },
        8: { cellWidth: 22 },
        9: { cellWidth: 16 },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  ${branding.name}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      },
    });

    const blob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
    this.triggerDownload(blob, `${fileName}.pdf`);
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // ── Helpers ──────────────────────────────────────────────

  getFullName(student: Student): string {
    return `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim();
  }

  getInitials(student: Student): string {
    return `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();
  }
}
