import { Component } from '@angular/core';

@Component({
  selector: 'app-attendance-reports',
  standalone: false,
  templateUrl: './attendance-reports.html',
  styleUrl: './attendance-reports.scss',
})
export class AttendanceReports {

}
// src/app/features/attendance/components/attendance-report/attendance-report.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';

interface AttendanceReport {
  date: string;
  service_type: string;
  total_present: number;
  total_absent: number;
  total_members: number;
  attendance_rate: number;
}

@Component({
  selector: 'app-attendance-report',
  templateUrl: './attendance-report.component.html',
  styleUrls: ['./attendance-report.component.scss']
})
export class AttendanceReportComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  filterForm!: FormGroup;
  reports: AttendanceReport[] = [];
  loading = false;
  errorMessage = '';

  // Summary Statistics
  summary = {
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
    'Bible Study',
    'Youth Service',
    'Special Event'
  ];

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    this.filterForm = this.fb.group({
      start_date: [this.formatDate(firstDayOfMonth)],
      end_date: [this.formatDate(lastDayOfMonth)],
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
    this.loading = true;
    this.errorMessage = '';

    const { start_date, end_date, service_type } = this.filterForm.value;

    this.attendanceService.getAttendanceReport(start_date, end_date, service_type || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.reports = data;
          this.calculateSummary();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading reports:', error);
          this.errorMessage = 'Failed to load attendance reports';
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
    // TODO: Implement export functionality
    alert('Export functionality coming soon!');
  }

  goBack(): void {
    this.router.navigate(['/attendance']);
  }

  getAttendanceColor(rate: number): string {
    if (rate >= 80) return '#10B981';
    if (rate >= 60) return '#F59E0B';
    return '#EF4444';
  }
}
