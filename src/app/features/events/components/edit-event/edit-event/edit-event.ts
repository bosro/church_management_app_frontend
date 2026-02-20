// src/app/features/events/components/edit-event/edit-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { ChurchEvent, EventCategory } from '../../../../../models/event.model';

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

  // Permissions
  canManageEvents = false;

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();

    if (this.eventId) {
      this.loadEvent();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageEvents = this.eventsService.canManageEvents();

    if (!this.canManageEvents) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: ['', [Validators.maxLength(2000)]],
      category: ['service', [Validators.required]],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]],
      start_time: [''],
      end_time: [''],
      location: ['', [Validators.maxLength(200)]],
      max_attendees: [null, [Validators.min(1)]],
      registration_deadline: [''],
      registration_required: [false],
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
          console.error('Error loading event:', error);
        },
      });
  }

  private populateForm(event: ChurchEvent): void {
    // Extract date and time from datetime strings
    const startDate = event.start_date ? event.start_date.split('T')[0] : '';
    const endDate = event.end_date ? event.end_date.split('T')[0] : startDate;
    const startTime = event.start_date ? this.extractTime(event.start_date) : '';
    const endTime = event.end_date ? this.extractTime(event.end_date) : '';

    this.eventForm.patchValue({
      title: event.title,
      description: event.description || '',
      category: event.category || 'service',
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      location: event.location || '',
      max_attendees: event.max_attendees || null,
      registration_deadline: event.registration_deadline || '',
      registration_required: event.registration_required || false,
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

    // Validate dates
    const startDate = new Date(this.eventForm.value.start_date);
    const endDate = new Date(this.eventForm.value.end_date);

    if (endDate < startDate) {
      this.errorMessage = 'End date cannot be before start date';
      this.scrollToTop();
      return;
    }

    // Validate registration deadline
    if (this.eventForm.value.registration_deadline) {
      const deadline = new Date(this.eventForm.value.registration_deadline);
      if (deadline > startDate) {
        this.errorMessage = 'Registration deadline must be before the event start date';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const eventData = {
      title: this.eventForm.value.title.trim(),
      description: this.eventForm.value.description?.trim() || undefined,
      category: this.eventForm.value.category,
      start_date: this.eventForm.value.start_date,
      end_date: this.eventForm.value.end_date,
      start_time: this.eventForm.value.start_time || undefined,
      end_time: this.eventForm.value.end_time || undefined,
      location: this.eventForm.value.location?.trim() || undefined,
      max_attendees: this.eventForm.value.max_attendees
        ? parseInt(this.eventForm.value.max_attendees)
        : undefined,
      registration_deadline: this.eventForm.value.registration_deadline || undefined,
      registration_required: this.eventForm.value.registration_required || false,
      is_public: this.eventForm.value.is_public !== undefined ? this.eventForm.value.is_public : true,
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
          this.errorMessage = error.message || 'Failed to update event. Please try again.';
          this.scrollToTop();
          console.error('Error updating event:', error);
        },
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
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

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.eventForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }
    if (control.hasError('min')) {
      const min = control.getError('min').min;
      return `Minimum value is ${min}`;
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
