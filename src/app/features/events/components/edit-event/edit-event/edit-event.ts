// src/app/features/events/components/edit-event/edit-event.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { ChurchEvent, EventCategory } from '../../../../../models/event.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';

@Component({
  selector: 'app-edit-event',
  standalone: false,
  templateUrl: './edit-event.html',
  styleUrl: './edit-event.scss',
})
export class EditEvent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: ChurchEvent | null = null;
  eventForm!: FormGroup;
  loading = false;
  loadingEvent = true;
  errorMessage = '';
  successMessage = '';

  eventTypes: { value: EventCategory; label: string }[] = [
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
    private fb: FormBuilder,
    private eventsService: EventsService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.eventId) this.loadEvent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const editRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
    ];

    this.canManageEvents =
      this.permissionService.isAdmin ||
      this.permissionService.events.edit ||
      editRoles.includes(role);

    if (!this.canManageEvents) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.eventForm = this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(200),
        ],
      ],
      description: ['', [Validators.maxLength(2000)]],
      // Use same field names as create-event for consistency
      event_type: ['service', [Validators.required]],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]],
      start_time: [''],
      end_time: [''],
      location: ['', [Validators.maxLength(200)]],
      max_attendees: [null, [Validators.min(1)]],
      registration_deadline: [''],
      requires_registration: [false],
      is_public: [true],
    });
  }

  private loadEvent(): void {
    this.loadingEvent = true;
    this.errorMessage = '';

    this.eventsService
      .getEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.populateForm(event);
          this.loadingEvent = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loadingEvent = false;
        },
      });
  }

  private populateForm(event: ChurchEvent): void {
    const startDate = event.start_date ? event.start_date.split('T')[0] : '';
    const endDate = event.end_date ? event.end_date.split('T')[0] : startDate;
    const startTime = event.start_date
      ? this.extractTime(event.start_date)
      : '';
    const endTime = event.end_date ? this.extractTime(event.end_date) : '';

    this.eventForm.patchValue({
      title: event.title,
      description: event.description || '',
      // Map category → event_type form control
      event_type: event.category || 'service',
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      location: event.location || '',
      max_attendees: event.max_attendees || null,
      registration_deadline: event.registration_deadline || '',
      requires_registration: event.registration_required || false,
      is_public: event.is_public !== undefined ? event.is_public : true,
    });
  }

  private extractTime(datetime: string): string {
    if (!datetime) return '';
    const date = new Date(datetime);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    const startDate = new Date(this.eventForm.value.start_date);
    const endDate = new Date(this.eventForm.value.end_date);

    if (endDate < startDate) {
      this.errorMessage = 'End date cannot be before start date';
      this.scrollToTop();
      return;
    }

    if (this.eventForm.value.registration_deadline) {
      const deadline = new Date(this.eventForm.value.registration_deadline);
      if (deadline > startDate) {
        this.errorMessage =
          'Registration deadline must be before the event start date';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const v = this.eventForm.value;
    const eventData = {
      title: v.title.trim(),
      description: v.description?.trim() || undefined,
      // Map event_type form control → category field expected by service
      category: v.event_type as EventCategory,
      start_date: v.start_date,
      end_date: v.end_date,
      start_time: v.start_time || undefined,
      end_time: v.end_time || undefined,
      location: v.location?.trim() || undefined,
      max_attendees: v.max_attendees ? parseInt(v.max_attendees) : undefined,
      registration_deadline: v.registration_deadline || undefined,
      registration_required: v.requires_registration || false,
      is_public: v.is_public !== undefined ? v.is_public : true,
    };

    this.eventsService
      .updateEvent(this.eventId, eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Event updated successfully!';
          this.loading = false;
          setTimeout(() => {
            this.router.navigate(['main/events', this.eventId]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage =
            error.message || 'Failed to update event. Please try again.';
          this.scrollToTop();
        },
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (
        confirm('You have unsaved changes. Are you sure you want to leave?')
      ) {
        this.router.navigate(['main/events', this.eventId]);
      }
    } else {
      this.router.navigate(['main/events', this.eventId]);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) this.markFormGroupTouched(control);
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.eventForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters allowed`;
    if (control.hasError('min'))
      return `Minimum value is ${control.getError('min').min}`;
    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
