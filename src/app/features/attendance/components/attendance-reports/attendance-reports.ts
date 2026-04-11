// src/app/features/attendance/components/attendance-report/attendance-report.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceReportData } from '../../../../models/attendance.model';
import { PermissionService } from '../../../../core/services/permission.service';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportSummary {
  total_services: number;
  average_attendance: number;
  highest_attendance: number;
  lowest_attendance: number;
  overall_rate: number;
}

@Component({
  selector: 'app-attendance-reports',
  standalone: false,
  templateUrl: './attendance-reports.html',
  styleUrl: './attendance-reports.scss',
})
export class AttendanceReports implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  filterForm!: FormGroup;
  reports: AttendanceReportData[] = [];
  loading = false;
  errorMessage = '';

  // Summary Statistics
  summary: ReportSummary = {
    total_services: 0,
    average_attendance: 0,
    highest_attendance: 0,
    lowest_attendance: 0,
    overall_rate: 0,
  };

  // Service Types
  serviceTypes: { value: string; label: string }[] = [
  { value: 'sunday_service',   label: 'Sunday Service' },
  { value: 'midweek_service',  label: 'Midweek Service' },
  { value: 'prayer_meeting',   label: 'Prayer Meeting' },
  { value: 'ministry_meeting', label: 'Ministry Meeting' },
  { value: 'special_event',    label: 'Special Event' },
];

  // Permissions
  canViewAttendance = false;

  showExportModal = false;
  exporting = false;

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    if (
      !this.permissionService.isAdmin &&
      !this.permissionService.attendance.reports
    ) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );

    this.filterForm = this.fb.group({
      start_date: [this.formatDate(firstDayOfMonth), [Validators.required]],
      end_date: [this.formatDate(lastDayOfMonth), [Validators.required]],
      service_type: [''],
    });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  loadReports(): void {
    if (this.filterForm.invalid) {
      this.markFormGroupTouched(this.filterForm);
      this.errorMessage = 'Please select valid dates';
      return;
    }

    const startDate = new Date(this.filterForm.value.start_date);
    const endDate = new Date(this.filterForm.value.end_date);

    if (startDate > endDate) {
      this.errorMessage = 'Start date must be before end date';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { start_date, end_date, service_type } = this.filterForm.value;

    this.attendanceService
      .getAttendanceReport(start_date, end_date, service_type || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.reports = data;
          this.calculateSummary();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading reports:', error);
          this.errorMessage =
            error.message || 'Failed to load attendance reports';
          this.loading = false;
        },
      });
  }

  private calculateSummary(): void {
    if (this.reports.length === 0) {
      this.summary = {
        total_services: 0,
        average_attendance: 0,
        highest_attendance: 0,
        lowest_attendance: 0,
        overall_rate: 0,
      };
      return;
    }

    const totalAttendance = this.reports.reduce(
      (sum, r) => sum + r.total_present,
      0,
    );
    const attendances = this.reports.map((r) => r.total_present);

    this.summary = {
      total_services: this.reports.length,
      average_attendance: Math.round(totalAttendance / this.reports.length),
      highest_attendance: Math.max(...attendances),
      lowest_attendance: Math.min(...attendances),
      overall_rate: Math.round(
        this.reports.reduce((sum, r) => sum + r.attendance_rate, 0) /
          this.reports.length,
      ),
    };
  }

  applyFilter(): void {
    this.loadReports();
  }

  resetFilter(): void {
    this.initForm();
    this.loadReports();
  }

  exportReport(): void {
    if (!this.reports.length) {
      this.errorMessage = 'No data to export';
      setTimeout(() => (this.errorMessage = ''), 3000);
      return;
    }
    this.showExportModal = true;
  }

  exportAs(format: 'csv' | 'excel' | 'pdf'): void {
    this.exporting = true;
    this.showExportModal = false;

    const { start_date, end_date } = this.filterForm.value;
    const fileName = `attendance_report_${start_date}_${end_date}`;

    try {
      if (format === 'csv') this.exportCSV(fileName);
      else if (format === 'excel') this.exportExcel(fileName);
      else if (format === 'pdf') this.exportPDF(fileName);
    } catch (err: any) {
      this.errorMessage = 'Export failed: ' + (err.message || 'Unknown error');
    } finally {
      this.exporting = false;
    }
  }

  private exportCSV(fileName: string): void {
    const headers = [
      'Date',
      'Service Type',
      'Present',
      'Absent',
      'Total Members',
      'Attendance Rate',
    ];
    const rows = this.reports.map((r) => [
      r.date,
      r.service_type,
      r.total_present.toString(),
      r.total_absent.toString(),
      r.total_members.toString(),
      `${r.attendance_rate}%`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join(
      '\n',
    );
    this.downloadBlob(new Blob([csv], { type: 'text/csv' }), `${fileName}.csv`);
  }

  private exportExcel(fileName: string): void {
    const rows = this.reports.map((r) => ({
      Date: r.date,
      'Service Type': r.service_type,
      Present: r.total_present,
      Absent: r.total_absent,
      'Total Members': r.total_members,
      'Attendance Rate (%)': r.attendance_rate,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 20 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 20 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    // Summary sheet
    const summaryData = [
      {
        Info: 'Period',
        Value: `${this.filterForm.value.start_date} to ${this.filterForm.value.end_date}`,
      },
      { Info: 'Total Services', Value: this.summary.total_services },
      { Info: 'Average Attendance', Value: this.summary.average_attendance },
      { Info: 'Highest Attendance', Value: this.summary.highest_attendance },
      { Info: 'Lowest Attendance', Value: this.summary.lowest_attendance },
      { Info: 'Overall Rate', Value: `${this.summary.overall_rate}%` },
      { Info: 'Export Date', Value: new Date().toLocaleDateString() },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    this.downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}.xlsx`,
    );
  }

  private exportPDF(fileName: string): void {
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

    // Header banner
    doc.setFillColor(91, 33, 182);
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Churchman', 14, 14);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Attendance Report', pageWidth / 2, 14, { align: 'center' });

    doc.setFontSize(9);
    doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

    // Period banner
    const { start_date, end_date } = this.filterForm.value;
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 22, pageWidth, 10, 'F');
    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Period: ${start_date} → ${end_date}`, pageWidth / 2, 29, {
      align: 'center',
    });

    // Stats row
    doc.setFillColor(249, 250, 251);
    doc.rect(0, 32, pageWidth, 14, 'F');

    const stats = [
      `Services: ${this.summary.total_services}`,
      `Avg Attendance: ${this.summary.average_attendance}`,
      `Highest: ${this.summary.highest_attendance}`,
      `Lowest: ${this.summary.lowest_attendance}`,
      `Overall Rate: ${this.summary.overall_rate}%`,
    ];

    doc.setTextColor(91, 33, 182);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    const colW = pageWidth / stats.length;
    stats.forEach((stat, i) => {
      doc.text(stat, colW * i + colW / 2, 41, { align: 'center' });
    });

    // Table
    autoTable(doc, {
      startY: 50,
      head: [
        [
          '#',
          'Date',
          'Service Type',
          'Present',
          'Absent',
          'Total Members',
          'Rate',
        ],
      ],
      body: this.reports.map((r, idx) => [
        idx + 1,
        r.date || '—',
        r.service_type || '—',
        r.total_present ?? '—',
        r.total_absent ?? '—',
        r.total_members ?? '—',
        `${r.attendance_rate ?? 0}%`,
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 28 },
        2: { cellWidth: 50 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 28 },
        6: { halign: 'center', cellWidth: 20 },
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  •  Churchman Church Management`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'center' },
        );
      },
    });

    this.downloadBlob(
      new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }),
      `${fileName}.pdf`,
    );
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  goBack(): void {
    this.router.navigate(['main/attendance']);
  }

  getAttendanceColor(rate: number): string {
    if (rate >= 80) return '#10B981';
    if (rate >= 60) return '#F59E0B';
    return '#EF4444';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}





