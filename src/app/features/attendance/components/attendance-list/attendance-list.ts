// src/app/features/attendance/components/attendance-list/attendance-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceEvent, AttendanceEventType, AttendanceStatistics } from '../../../../models/attendance.model';

@Component({
  selector: 'app-attendance-list',
  standalone: false,
  templateUrl: './attendance-list.html',
  styleUrl: './attendance-list.scss',
})
export class AttendanceList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  events: AttendanceEvent[] = [];
  loading = false;
  errorMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalEvents = 0;
  totalPages = 0;

  // Filters
  selectedEventType: AttendanceEventType | '' = '';
  eventTypes: { value: AttendanceEventType | '', label: string }[] = [
    { value: '', label: 'All Events' },
    { value: 'sunday_service', label: 'Sunday Service' },
    { value: 'midweek_service', label: 'Midweek Service' },
    { value: 'ministry_meeting', label: 'Ministry Meeting' },
    { value: 'special_event', label: 'Special Event' },
    { value: 'prayer_meeting', label: 'Prayer Meeting' }
  ];

  // Statistics
  statistics: AttendanceStatistics | null = null;

  // Permissions
  canManageAttendance = false;
  canMarkAttendance = false;

  constructor(
    private attendanceService: AttendanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEvents();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageAttendance = this.attendanceService.canManageAttendance();
    this.canMarkAttendance = this.attendanceService.canMarkAttendance();

    if (!this.attendanceService.canViewAttendance()) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadEvents(): void {
    this.loading = true;
    this.errorMessage = '';

    const filters = this.selectedEventType
      ? { eventType: this.selectedEventType as AttendanceEventType }
      : undefined;

    this.attendanceService
      .getAttendanceEvents(this.currentPage, this.pageSize, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.events = data;
          this.totalEvents = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load events';
          this.loading = false;
          console.error('Error loading events:', error);
        }
      });
  }

  loadStatistics(): void {
    this.attendanceService
      .getAttendanceStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        }
      });
  }

  onEventTypeChange(): void {
    this.currentPage = 1;
    this.loadEvents();
  }

  // Navigation
  viewEvent(eventId: string): void {
    this.router.navigate(['main/attendance', eventId]);
  }

  createEvent(): void {
    if (!this.canManageAttendance) {
      this.errorMessage = 'You do not have permission to create events';
      return;
    }
    this.router.navigate(['main/attendance/create']);
  }

  markAttendance(eventId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canMarkAttendance) {
      this.errorMessage = 'You do not have permission to mark attendance';
      return;
    }
    this.router.navigate(['main/attendance', eventId, 'mark']);
  }

  viewReports(): void {
    this.router.navigate(['main/attendance/reports']);
  }

  viewVisitors(): void {
    this.router.navigate(['main/attendance/visitors']);
  }

  deleteEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.canManageAttendance) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }

    const attendanceEvent = this.events.find(e => e.id === eventId);
    if (!attendanceEvent) return;

    const confirmMessage = attendanceEvent.total_attendance > 0
      ? `This event has ${attendanceEvent.total_attendance} attendance records. Are you sure you want to delete it?`
      : 'Are you sure you want to delete this event?';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.attendanceService
      .deleteAttendanceEvent(eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadEvents();
          this.loadStatistics();
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
          console.error('Delete error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadEvents();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadEvents();
      this.scrollToTop();
    }
  }

  // Helper methods
  getEventTypeLabel(type: string): string {
    const eventType = this.eventTypes.find(et => et.value === type);
    return eventType?.label || type;
  }

  getEventTypeClass(type: string): string {
    const typeMap: Record<string, string> = {
      'sunday_service': 'type-sunday',
      'midweek_service': 'type-midweek',
      'ministry_meeting': 'type-ministry',
      'special_event': 'type-special',
      'prayer_meeting': 'type-prayer'
    };
    return typeMap[type] || '';
  }

  calculateAttendanceRate(event: AttendanceEvent): number {
    if (!event.expected_attendance || event.expected_attendance === 0) {
      return 0;
    }
    return Math.round((event.total_attendance / event.expected_attendance) * 100);
  }

  getAttendanceRateClass(rate: number): string {
    if (rate >= 80) return 'rate-high';
    if (rate >= 50) return 'rate-medium';
    return 'rate-low';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
