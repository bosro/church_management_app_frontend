
// src/app/features/attendance/components/attendance-detail/attendance-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../../services/attendance.service';
import { AttendanceEvent } from '../../../../../models/attendance.model';


@Component({
 selector: 'app-attendance-detail',
  standalone: false,
  templateUrl: './attendance-detail.html',
  styleUrl: './attendance-detail.scss',
})
export class AttendanceDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: AttendanceEvent | null = null;
  attendanceRecords: any[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService
  ) {}

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    if (this.eventId) {
      this.loadEventDetails();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEventDetails(): void {
    this.loading = true;

    // Load event
    this.attendanceService.getAttendanceEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loading = false;
        }
      });

    // Load attendance records
    this.attendanceService.getAttendanceRecords(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.attendanceRecords = records;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading records:', error);
          this.loading = false;
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/attendance']);
  }

  markAttendance(): void {
    this.router.navigate(['/attendance', this.eventId, 'mark']);
  }

  exportReport(): void {
    this.attendanceService.exportAttendanceReport(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `attendance_${this.event?.event_name}_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  deleteEvent(): void {
    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    this.attendanceService.deleteAttendanceEvent(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['/attendance']);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
        }
      });
  }

  getAttendanceName(record: any): string {
    if (record.member) {
      return `${record.member.first_name} ${record.member.last_name}`;
    }
    if (record.visitor) {
      return `${record.visitor.first_name} ${record.visitor.last_name}`;
    }
    return 'Unknown';
  }

  getAttendanceType(record: any): string {
    return record.member ? 'Member' : 'Visitor';
  }

  getMemberNumber(record: any): string {
    return record.member?.member_number || 'N/A';
  }

  getCheckInTime(record: any): string {
    return new Date(record.checked_in_at).toLocaleString();
  }

  getMemberInitials(record: any): string {
    if (record.member) {
      return `${record.member.first_name[0]}${record.member.last_name[0]}`.toUpperCase();
    }
    if (record.visitor) {
      return `${record.visitor.first_name[0]}${record.visitor.last_name[0]}`.toUpperCase();
    }
    return '?';
  }

  calculateAttendanceRate(): number {
    if (!this.event?.expected_attendance || this.event.expected_attendance === 0) {
      return 0;
    }
    return Math.round((this.event.total_attendance / this.event.expected_attendance) * 100);
  }

  getAttendanceRateClass(): string {
    const rate = this.calculateAttendanceRate();
    if (rate >= 80) return 'rate-high';
    if (rate >= 50) return 'rate-medium';
    return 'rate-low';
  }
}
