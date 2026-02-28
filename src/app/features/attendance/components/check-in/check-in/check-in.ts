// src/app/features/attendance/components/check-in/check-in.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceEvent } from '../../../../../models/attendance.model';
import { AttendanceService } from '../../../services/attendance.service';


@Component({
  selector: 'app-check-in',
  standalone: false,
  templateUrl: './check-in.html',
  styleUrl: './check-in.scss',
})
export class CheckIn implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  events: AttendanceEvent[] = [];
  todayEvents: AttendanceEvent[] = [];
  upcomingEvents: AttendanceEvent[] = [];
  recentEvents: AttendanceEvent[] = [];
  hasError = false;
  errorMessage = '';

  // Quick action permissions
  canCreateEvent = false;

  constructor(
    private attendanceService: AttendanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canCreateEvent = this.attendanceService.canManageAttendance();
  }

  private loadEvents(): void {
    this.loading = true;
    this.hasError = false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const weekLater = new Date();
    weekLater.setDate(today.getDate() + 7);
    const weekLaterStr = weekLater.toISOString().split('T')[0];

    // Load events from last week to next week
    this.attendanceService
      .getAttendanceEvents(1, 50, {
        startDate: weekAgoStr,
        endDate: weekLaterStr
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          this.events = data;
          this.categorizeEvents(data, todayStr);
          this.loading = false;

          // Auto-navigate to today's first event if exists
          if (this.todayEvents.length === 1) {
            // Only auto-navigate if there's exactly one event today
            setTimeout(() => {
              this.goToMarkAttendance(this.todayEvents[0].id);
            }, 500);
          }
        },
        error: (error) => {
          this.loading = false;
          this.hasError = true;
          this.errorMessage = error.message || 'Failed to load events';
          console.error('Error loading events:', error);
        }
      });
  }

  private categorizeEvents(events: AttendanceEvent[], todayStr: string): void {
    const today = new Date(todayStr);

    this.todayEvents = events.filter(e => e.event_date === todayStr);

    this.upcomingEvents = events.filter(e => {
      const eventDate = new Date(e.event_date);
      return eventDate > today;
    }).slice(0, 5); // Limit to 5 upcoming events

    this.recentEvents = events.filter(e => {
      const eventDate = new Date(e.event_date);
      return eventDate < today;
    }).slice(0, 5); // Limit to 5 recent events
  }

  goToMarkAttendance(eventId: string): void {
    this.router.navigate(['main/attendance', eventId, 'mark']);
  }

  goToEventDetails(eventId: string): void {
    this.router.navigate(['main/attendance', eventId]);
  }

  createEvent(): void {
    this.router.navigate(['main/attendance/create']);
  }

  retryLoad(): void {
    this.loadEvents();
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const eventDate = new Date(dateString);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (eventDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else if (eventDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${month} ${day}, ${year}`;
  }

  formatTime(timeString?: string): string {
    if (!timeString) return '';

    // timeString is in format "HH:mm" or "HH:mm:ss"
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minutes} ${ampm}`;
  }

  getEventTypeLabel(eventType: string): string {
    const labels: Record<string, string> = {
      sunday_service: 'Sunday Service',
      midweek_service: 'Midweek Service',
      ministry_meeting: 'Ministry Meeting',
      special_event: 'Special Event',
      prayer_meeting: 'Prayer Meeting'
    };
    return labels[eventType] || eventType;
  }

  getEventTypeClass(eventType: string): string {
    const classes: Record<string, string> = {
      sunday_service: 'type-sunday',
      midweek_service: 'type-midweek',
      ministry_meeting: 'type-ministry',
      special_event: 'type-special',
      prayer_meeting: 'type-prayer'
    };
    return classes[eventType] || '';
  }
}
