
// src/app/features/attendance/components/attendance-list/attendance-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceEvent, AttendanceEventType } from '../../../../models/attendance.model';

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
  statistics: any = null;

  constructor(
    private attendanceService: AttendanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadEvents();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEvents(): void {
    this.loading = true;

    const eventType = this.selectedEventType || undefined;

    this.attendanceService.getAttendanceEvents(this.currentPage, this.pageSize, eventType)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.events = data;
          this.totalEvents = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading events:', error);
          this.loading = false;
        }
      });
  }

  loadStatistics(): void {
    this.attendanceService.getAttendanceStatistics()
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
    this.router.navigate(['/attendance', eventId]);
  }

  createEvent(): void {
    this.router.navigate(['/attendance/create']);
  }

  markAttendance(eventId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/attendance', eventId, 'mark']);
  }

  viewReports(): void {
    this.router.navigate(['/attendance/reports']);
  }

  viewVisitors(): void {
    this.router.navigate(['/attendance/visitors']);
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadEvents();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadEvents();
    }
  }

  // Delete event
  deleteEvent(eventId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this event?')) {
      this.attendanceService.deleteAttendanceEvent(eventId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadEvents();
          },
          error: (error) => {
            console.error('Error deleting event:', error);
          }
        });
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
}
