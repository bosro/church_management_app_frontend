// src/app/features/events/components/create-event/create-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { EventCategory } from '../../../../../models/event.model';

@Component({
  selector: 'app-create-event',
  standalone: false,
  templateUrl: './create-event.html',
  styleUrl: './create-event.scss',
})
export class CreateEvent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  eventTypes: { value: EventCategory; label: string }[] = [
    { value: 'service', label: 'Service' },
    { value: 'conference', label: 'Conference' },
    { value: 'seminar', label: 'Seminar' },
    { value: 'retreat', label: 'Retreat' },
    { value: 'outreach', label: 'Outreach' },
    { value: 'social', label: 'Social' },
    { value: 'youth', label: 'Youth' },
    { value: 'children', label: 'Children' },
    { value: 'other', label: 'Other' },
  ];

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      category: ['service' as EventCategory, [Validators.required]], // <-- use EventCategory
      start_date: [today, [Validators.required]],
      end_date: [today, [Validators.required]],
      start_time: [''],
      end_time: [''],
      location: [''],
      max_attendees: [''],
      registration_deadline: [''],
      registration_required: [false],
      is_public: [true],
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
      .createEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          setTimeout(() => {
            this.router.navigate(['/events', event.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage =
            error.message || 'Failed to create event. Please try again.';
        },
      });
  }

  cancel(): void {
    this.router.navigate(['/events']);
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
