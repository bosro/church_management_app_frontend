import { Component } from '@angular/core';

@Component({
  selector: 'app-events-list',
  standalone: false,
  templateUrl: './events-list.html',
  styleUrl: './events-list.scss',
})
export class EventsList {

}
// src/app/features/events/components/events-list/events-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../services/events.service';
import { Event, EventType } from '../../../../models/event.model';

@Component({
  selector: 'app-events-list',
  templateUrl: './events-list.component.html',
  styleUrls: ['./events-list.component.scss']
})
export class EventsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  events: Event[] = [];
  upcomingEvents: Event[] = [];
  loading = false;

  // View mode
  viewMode: 'list' | 'calendar' = 'list';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalEvents = 0;
  totalPages = 0;

  // Filters
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  eventTypeControl = new FormControl('');

  eventTypes: { value: EventType | '', label: string }[] = [
    { value: '', label: 'All Types' },
    { value: 'service', label: 'Service' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'conference', label: 'Conference' },
    { value: 'retreat', label: 'Retreat' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'social', label: 'Social' },
    { value: 'other', label: 'Other' }
  ];

  constructor(
    private eventsService: EventsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadEvents();
    this.loadUpcomingEvents();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEvents(): void {
    this.loading = true;

    const filters: any = {};

    if (this.startDateControl.value) {
      filters.startDate = this.startDateControl.value;
    }
    if (this.endDateControl.value) {
      filters.endDate = this.endDateControl.value;
    }
    if (this.eventTypeControl.value) {
      filters.eventType = this.eventTypeControl.value;
    }

    this.eventsService.getEvents(this.currentPage, this.pageSize, filters)
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

  private loadUpcomingEvents(): void {
    this.eventsService.getUpcomingEvents(5)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.upcomingEvents = events;
        },
        error: (error) => {
          console.error('Error loading upcoming events:', error);
        }
      });
  }

  private setupFilterListeners(): void {
    this.startDateControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });

    this.endDateControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });

    this.eventTypeControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
    this.eventTypeControl.setValue('');
  }

  switchView(mode: 'list' | 'calendar'): void {
    this.viewMode = mode;
  }

  // Navigation
  viewEvent(eventId: string): void {
    this.router.navigate(['/events', eventId]);
  }

  createEvent(): void {
    this.router.navigate(['/events/create']);
  }

  editEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.router.navigate(['/events', eventId, 'edit']);
  }

  deleteEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this event?')) {
      this.eventsService.deleteEvent(eventId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadEvents();
            this.loadUpcomingEvents();
          },
          error: (error) => {
            console.error('Error deleting event:', error);
          }
        });
    }
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

  // Helper methods
  getEventTypeLabel(type: EventType): string {
    const typeObj = this.eventTypes.find(t => t.value === type);
    return typeObj?.label || type;
  }

  getEventTypeClass(type: EventType): string {
    const classes: Record<EventType, string> = {
      service: 'type-service',
      meeting: 'type-meeting',
      conference: 'type-conference',
      retreat: 'type-retreat',
      workshop: 'type-workshop',
      social: 'type-social',
      other: 'type-other'
    };
    return classes[type] || 'type-other';
  }

  isEventPast(event: Event): boolean {
    const eventDate = new Date(event.end_date || event.start_date);
    return eventDate < new Date();
  }

  isEventToday(event: Event): boolean {
    const today = new Date().toISOString().split('T')[0];
    return event.start_date === today;
  }

  isEventUpcoming(event: Event): boolean {
    const eventDate = new Date(event.start_date);
    return eventDate > new Date();
  }

  formatDateRange(event: Event): string {
    const start = new Date(event.start_date);
    const end = new Date(event.end_date);

    if (event.start_date === event.end_date) {
      return start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
}
