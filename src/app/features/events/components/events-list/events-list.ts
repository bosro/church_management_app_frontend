// src/app/features/events/components/events-list/events-list.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { EventsService } from '../../services/events';
import { ChurchEvent, EventCategory } from '../../../../models/event.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-events-list',
  standalone: false,
  templateUrl: './events-list.html',
  styleUrl: './events-list.scss',
})
export class EventsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  events: ChurchEvent[] = [];
  upcomingEvents: ChurchEvent[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  currentPage = 1;
  pageSize = 20;
  totalEvents = 0;
  totalPages = 0;

  viewMode: 'list' | 'calendar' = 'list';

  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryControl = new FormControl<EventCategory | 'all'>('all');

  categories: { value: EventCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'service', label: 'Service' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'conference', label: 'Conference' },
    { value: 'seminar', label: 'Seminar' },
    { value: 'retreat', label: 'Retreat' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'outreach', label: 'Outreach' },
    { value: 'social', label: 'Social' },
    { value: 'youth', label: 'Youth' },
    { value: 'children', label: 'Children' },
    { value: 'other', label: 'Other' },
  ];

  canManageEvents = false;

  constructor(
    private eventsService: EventsService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadEvents();
    this.loadUpcomingEvents();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const viewRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'finance_officer',
      'elder',
      'deacon',
      'worship_leader',
      'secretary',
    ];

    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
    ];

    const canView =
      this.permissionService.isAdmin ||
      this.permissionService.events.view ||
      viewRoles.includes(role);

    this.canManageEvents =
      this.permissionService.isAdmin ||
      this.permissionService.events.create ||
      this.permissionService.events.edit ||
      this.permissionService.events.delete ||
      manageRoles.includes(role);

    if (!canView) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private setupFilterListeners(): void {
    this.startDateControl.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });

    this.endDateControl.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });

    this.categoryControl.valueChanges
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadEvents();
      });
  }

  loadEvents(): void {
    this.loading = true;
    this.errorMessage = '';

    const filters: any = {};
    if (this.startDateControl.value)
      filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value) filters.endDate = this.endDateControl.value;
    const category = this.categoryControl.value;
    if (category && category !== 'all') filters.category = category;

    this.eventsService
      .getEvents(this.currentPage, this.pageSize, filters)
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
        },
      });
  }

  private loadUpcomingEvents(): void {
    this.eventsService
      .getUpcomingEvents(5)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          this.upcomingEvents = events;
        },
        error: (error) => {
          console.error('Error loading upcoming events:', error);
        },
      });
  }

  createEvent(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to create events';
      return;
    }
    this.router.navigate(['main/events/create']);
  }

  viewEvent(eventId: string): void {
    this.router.navigate(['main/events', eventId]);
  }

  editEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to edit events';
      return;
    }
    this.router.navigate(['main/events', eventId, 'edit']);
  }

  deleteEvent(eventId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }

    if (
      !confirm(
        'Are you sure you want to delete this event? All registrations will also be deleted.',
      )
    )
      return;

    this.eventsService
      .deleteEvent(eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Event deleted successfully!';
          this.loadEvents();
          this.loadUpcomingEvents();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
        },
      });
  }

  switchView(mode: 'list' | 'calendar'): void {
    this.viewMode = mode;
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
    this.categoryControl.setValue('all');
  }

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

  getEventCategoryLabel(category: EventCategory): string {
    const categoryMap: Record<EventCategory, string> = {
      service: 'Service',
      meeting: 'Meeting',
      conference: 'Conference',
      seminar: 'Seminar',
      retreat: 'Retreat',
      workshop: 'Workshop',
      outreach: 'Outreach',
      social: 'Social',
      youth: 'Youth',
      children: 'Children',
      other: 'Other',
    };
    return categoryMap[category] || 'Other';
  }

  getEventCategoryClass(category: EventCategory): string {
    const classMap: Record<EventCategory, string> = {
      service: 'type-service',
      meeting: 'type-meeting',
      conference: 'type-conference',
      seminar: 'type-seminar',
      retreat: 'type-retreat',
      workshop: 'type-workshop',
      outreach: 'type-outreach',
      social: 'type-social',
      youth: 'type-youth',
      children: 'type-children',
      other: 'type-other',
    };
    return classMap[category] || 'type-other';
  }

  isEventToday(event: ChurchEvent): boolean {
    const today = new Date().toISOString().split('T')[0];
    return event.start_date.split('T')[0] === today;
  }

  isEventUpcoming(event: ChurchEvent): boolean {
    return new Date(event.start_date) > new Date();
  }

  isEventPast(event: ChurchEvent): boolean {
    return new Date(event.end_date || event.start_date) < new Date();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// src/app/features/events/components/event-detail/event-detail.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback
// ─────────────────────────────────────────────────────────────────────────────
// (paste below into its own file — split at the comment above)
