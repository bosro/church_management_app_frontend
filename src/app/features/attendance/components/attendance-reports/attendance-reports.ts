// src/app/features/attendance/components/attendance-report/attendance-report.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceReportData } from '../../../../models/attendance.model';

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
    overall_rate: 0
  };

  // Service Types
  serviceTypes = [
    'Sunday Service',
    'Midweek Service',
    'Prayer Meeting',
    'Ministry Meeting',
    'Special Event'
  ];

  // Permissions
  canViewAttendance = false;

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router
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
    this.canViewAttendance = this.attendanceService.canViewAttendance();

    if (!this.canViewAttendance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    this.filterForm = this.fb.group({
      start_date: [this.formatDate(firstDayOfMonth), [Validators.required]],
      end_date: [this.formatDate(lastDayOfMonth), [Validators.required]],
      service_type: ['']
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
          this.errorMessage = error.message || 'Failed to load attendance reports';
          this.loading = false;
        }
      });
  }

  private calculateSummary(): void {
    if (this.reports.length === 0) {
      this.summary = {
        total_services: 0,
        average_attendance: 0,
        highest_attendance: 0,
        lowest_attendance: 0,
        overall_rate: 0
      };
      return;
    }

    const totalAttendance = this.reports.reduce((sum, r) => sum + r.total_present, 0);
    const attendances = this.reports.map(r => r.total_present);

    this.summary = {
      total_services: this.reports.length,
      average_attendance: Math.round(totalAttendance / this.reports.length),
      highest_attendance: Math.max(...attendances),
      lowest_attendance: Math.min(...attendances),
      overall_rate: Math.round(
        this.reports.reduce((sum, r) => sum + r.attendance_rate, 0) / this.reports.length
      )
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
    // Create CSV from reports
    const headers = [
      'Date',
      'Service Type',
      'Present',
      'Absent',
      'Total Members',
      'Attendance Rate'
    ];

    const rows = this.reports.map(report => [
      report.date,
      report.service_type,
      report.total_present.toString(),
      report.total_absent.toString(),
      report.total_members.toString(),
      `${report.attendance_rate}%`
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${this.filterForm.value.start_date}_${this.filterForm.value.end_date}.csv`;
    a.click();
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
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
