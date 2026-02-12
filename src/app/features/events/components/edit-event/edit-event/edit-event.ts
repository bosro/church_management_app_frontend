// src/app/features/events/components/edit-event/edit-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { EventCategory, Event } from '../../../../../models/event.model';

@Component({
  selector: 'app-edit-event',
  standalone: false,
  templateUrl: './edit-event.html',
  styleUrl: './edit-event.scss',
})
export class EditEvent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: Event | null = null;
  eventForm!: FormGroup;
  loading = false;
  loadingEvent = true;
  errorMessage = '';
  successMessage = '';

 eventTypes: { value: EventCategory; label: string }[] = [
    { value: 'service', label: 'Service' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'conference', label: 'Conference' },
    { value: 'retreat', label: 'Retreat' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'social', label: 'Social' },
    { value: 'other', label: 'Other' },
  ];

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
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

  private initForm(): void {
    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      event_type: ['service', [Validators.required]],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]],
      start_time: [''],
      end_time: [''],
      location: [''],
      max_attendees: [''],
      registration_deadline: [''],
      requires_registration: [false],
      is_public: [true],
    });
  }

  private loadEvent(): void {
    this.loadingEvent = true;

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

  private populateForm(event: Event): void {
    this.eventForm.patchValue({
      title: event.title,
      description: event.description,
      event_type: event.event_type,
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_date,
      end_time: event.end_date,
      location: event.location,
      max_attendees: event.max_attendees,
      registration_deadline: event.registration_deadline,
      requires_registration: event.requires_registration,
      is_public: event.is_public,
    });
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    // Validate dates
    const startDate = new Date(this.eventForm.value.start_date);
    const endDate = new Date(this.eventForm.value.end_date);

    if (endDate < startDate) {
      this.errorMessage = 'End date cannot be before start date';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const eventData = {
      ...this.eventForm.value,
      max_attendees: this.eventForm.value.max_attendees
        ? parseInt(this.eventForm.value.max_attendees)
        : null,
      start_time: this.eventForm.value.start_time || null,
      end_time: this.eventForm.value.end_time || null,
      location: this.eventForm.value.location || null,
      registration_deadline: this.eventForm.value.registration_deadline || null,
    };

    this.eventsService
      .updateEvent(this.eventId, eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Event updated successfully!';
          setTimeout(() => {
            this.router.navigate(['main/events', this.eventId]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage =
            error.message || 'Failed to update event. Please try again.';
        },
      });
  }

  cancel(): void {
    this.router.navigate(['main/events', this.eventId]);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.eventForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
