import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { ChurchEvent, EventCategory } from '../../../../../models/event.model';

@Component({
  selector: 'app-event-detail',
  standalone: false,
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
})
export class EventDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: ChurchEvent | null = null;
  registrations: any[] = [];
  statistics: any = null;
  loading = true;
  errorMessage = '';
  successMessage = '';

  // Registration Form
  showRegistrationForm = false;
  searchControl = new FormControl('');
  searchResults: any[] = [];
  searching = false;
  selectedMember: any = null;
  guestName = '';
  guestEmail = '';
  guestPhone = '';
  registrationNotes = '';
  registering = false;

  // Permissions
  canManageEvents = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventsService: EventsService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';

    if (this.eventId) {
      this.loadEventDetails();
      this.setupMemberSearch();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageEvents = this.eventsService.canManageEvents();
  }

  private loadEventDetails(): void {
    this.loading = true;
    this.errorMessage = '';

    // Load event
    this.eventsService
      .getEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loading = false;
          console.error('Error loading event:', error);
        },
      });

    // Load registrations
    this.loadRegistrations();

    // Load statistics
    this.loadStatistics();
  }

  private loadRegistrations(): void {
    this.eventsService
      .getEventRegistrations(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (registrations) => {
          this.registrations = registrations;
        },
        error: (error) => {
          console.error('Error loading registrations:', error);
        },
      });
  }

  private loadStatistics(): void {
    this.eventsService
      .getEventStatistics(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        },
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.eventsService.searchMembersForEvent(this.eventId, query);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
          this.searchResults = [];
        },
      });
  }

  // Registration Management
  toggleRegistrationForm(): void {
    this.showRegistrationForm = !this.showRegistrationForm;
    if (!this.showRegistrationForm) {
      this.resetRegistrationForm();
    }
  }

  selectMember(member: any): void {
    this.selectedMember = member;
    this.searchControl.setValue('', { emitEvent: false });
    this.searchResults = [];
  }

  removeSelectedMember(): void {
    this.selectedMember = null;
  }

  registerAttendee(): void {
    // Validate
    if (!this.selectedMember && (!this.guestName || !this.guestEmail)) {
      this.errorMessage =
        'Please select a member or provide guest details (name and email required)';
      setTimeout(() => (this.errorMessage = ''), 5000);
      return;
    }

    // Validate email format for guests
    if (!this.selectedMember && this.guestEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.guestEmail)) {
        this.errorMessage = 'Please provide a valid email address';
        setTimeout(() => (this.errorMessage = ''), 5000);
        return;
      }
    }

    this.registering = true;
    this.errorMessage = '';
    this.successMessage = '';

    const registrationData: any = {};

    if (this.selectedMember) {
      registrationData.memberId = this.selectedMember.id;
    } else {
      registrationData.name = this.guestName.trim();
      registrationData.email = this.guestEmail.trim();
      registrationData.phone = this.guestPhone.trim() || undefined;
    }

    if (this.registrationNotes.trim()) {
      registrationData.notes = this.registrationNotes.trim();
    }

    this.eventsService
      .registerForEvent(this.eventId, registrationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration successful!';
          this.loadRegistrations();
          this.loadStatistics();
          this.toggleRegistrationForm();
          this.registering = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to register';
          this.registering = false;
          console.error('Registration error:', error);
        },
      });
  }

  checkInRegistration(registrationId: string): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to check in attendees';
      return;
    }

    this.eventsService
      .checkInRegistration(registrationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Attendee checked in successfully!';
          this.loadRegistrations();
          this.loadStatistics();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to check in';
          console.error('Check-in error:', error);
        },
      });
  }

  cancelRegistration(registrationId: string): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to cancel registrations';
      return;
    }

    if (!confirm('Are you sure you want to cancel this registration?')) {
      return;
    }

    this.eventsService
      .cancelRegistration(registrationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration cancelled successfully!';
          this.loadRegistrations();
          this.loadStatistics();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to cancel registration';
          console.error('Cancel registration error:', error);
        },
      });
  }

  private resetRegistrationForm(): void {
    this.selectedMember = null;
    this.guestName = '';
    this.guestEmail = '';
    this.guestPhone = '';
    this.registrationNotes = '';
    this.searchControl.setValue('', { emitEvent: false });
    this.searchResults = [];
  }

  // Export
  exportRegistrations(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to export registrations';
      return;
    }

    this.eventsService
      .exportEventRegistrations(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.event?.title || 'event'}_registrations_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Registrations exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export registrations';
          console.error('Export error:', error);
        },
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/events']);
  }

  editEvent(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to edit events';
      return;
    }

    this.router.navigate(['main/events', this.eventId, 'edit']);
  }

  deleteEvent(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }

    const confirmMessage =
      'Are you sure you want to delete this event? This action cannot be undone. All registrations will also be deleted.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.eventsService
      .deleteEvent(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['main/events']);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
          console.error('Delete event error:', error);
        },
      });
  }

  // Helper methods
  getEventCategoryLabel(category?: EventCategory): string {
    if (!category) return 'Other';

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

  getEventCategoryClass(category?: EventCategory): string {
    if (!category) return 'type-other';

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
  formatDateRange(event: ChurchEvent): string {
    const start = new Date(event.start_date);
    const end = new Date(event.end_date || event.start_date);

    const startDateStr = event.start_date.split('T')[0];
    const endDateStr = (event.end_date || event.start_date).split('T')[0];

    if (startDateStr === endDateStr) {
      return start.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  getAttendeeName(registration: any): string {
    if (registration.member) {
      return `${registration.member.first_name} ${registration.member.last_name}`;
    }
    return registration.name || 'Guest';
  }

  getAttendeeInitials(registration: any): string {
    if (registration.member) {
      return `${registration.member.first_name[0]}${registration.member.last_name[0]}`.toUpperCase();
    }
    if (registration.name) {
      const names = registration.name.split(' ');
      return names.length > 1
        ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
        : registration.name[0].toUpperCase();
    }
    return 'G';
  }

  getMemberName(member: any): string {
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: any): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }
}
