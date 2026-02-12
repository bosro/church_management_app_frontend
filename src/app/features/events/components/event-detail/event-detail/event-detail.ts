// src/app/features/events/components/event-detail/event-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { of, Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { MemberService } from '../../../../members/services/member.service';
import { EventCategory, Event } from '../../../../../models/event.model';

@Component({
  selector: 'app-event-detail',
  standalone: false,
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
})
export class EventDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: Event | null = null;
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventsService: EventsService,
    private memberService: MemberService,
  ) {}

  ngOnInit(): void {
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

  private loadEventDetails(): void {
    this.loading = true;

    // Load event
    this.eventsService
      .getEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loading = false;
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
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading registrations:', error);
          this.loading = false;
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
            return of([]); // <-- wrap in observable
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
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  removeSelectedMember(): void {
    this.selectedMember = null;
  }

  registerAttendee(): void {
    // Validate
    if (!this.selectedMember && (!this.guestName || !this.guestEmail)) {
      this.errorMessage = 'Please select a member or provide guest details';
      return;
    }

    this.registering = true;
    this.errorMessage = '';

    const registrationData: any = {};

    if (this.selectedMember) {
      registrationData.memberId = this.selectedMember.id;
    } else {
      registrationData.name = this.guestName;
      registrationData.email = this.guestEmail;
      registrationData.phone = this.guestPhone;
    }

    if (this.registrationNotes) {
      registrationData.notes = this.registrationNotes;
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
        },
      });
  }

  checkInRegistration(registrationId: string): void {
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
        },
      });
  }

  cancelRegistration(registrationId: string): void {
    if (confirm('Are you sure you want to cancel this registration?')) {
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
            this.errorMessage =
              error.message || 'Failed to cancel registration';
          },
        });
    }
  }

  private resetRegistrationForm(): void {
    this.selectedMember = null;
    this.guestName = '';
    this.guestEmail = '';
    this.guestPhone = '';
    this.registrationNotes = '';
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  // Export
  exportRegistrations(): void {
    this.eventsService
      .exportEventRegistrations(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.event?.title}_registrations.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Export error:', error);
        },
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/events']);
  }

  editEvent(): void {
    this.router.navigate(['main/events', this.eventId, 'edit']);
  }

  deleteEvent(): void {
    if (confirm('Are you sure you want to delete this event?')) {
      this.eventsService
        .deleteEvent(this.eventId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.router.navigate(['main/events']);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete event';
          },
        });
    }
  }

  // Helper methods
  getEventCategoryLabel(type?: EventCategory): string {
    const classes: Partial<Record<EventCategory, string>> = {
      service: 'Service',
      meeting: 'Meeting',
      conference: 'Conference',
      retreat: 'Retreat',
      workshop: 'Workshop',
      social: 'Social',
      other: 'Other',
    };
    return type ? (classes[type] ?? 'type-other') : 'type-other';
  }

  getEventCategoryClass(type?: EventCategory): string {
    const classes: Partial<Record<EventCategory, string>> = {
      service: 'type-service',
      meeting: 'type-meeting',
      conference: 'type-conference',
      retreat: 'type-retreat',
      workshop: 'type-workshop',
      social: 'type-social',
      other: 'type-other',
    };
    return type ? (classes[type] ?? 'type-other') : 'type-other';
  }

  formatDateRange(event: Event): string {
    const start = new Date(event.start_date ?? '');
    const end = new Date(event.end_date ?? event.start_date ?? '');

    if (!event.start_date) return 'Date not available';

    if (event.start_date === event.end_date) {
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
