

// src/app/features/attendance/components/create-event/create-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../../services/attendance.service';
import { AttendanceEventType } from '../../../../../models/attendance.model';


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

  eventTypes: { value: AttendanceEventType, label: string }[] = [
    { value: 'sunday_service', label: 'Sunday Service' },
    { value: 'midweek_service', label: 'Midweek Service' },
    { value: 'ministry_meeting', label: 'Ministry Meeting' },
    { value: 'special_event', label: 'Special Event' },
    { value: 'prayer_meeting', label: 'Prayer Meeting' }
  ];

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router
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
      event_type: ['sunday_service', [Validators.required]],
      event_name: ['', [Validators.required, Validators.minLength(3)]],
      event_date: [today, [Validators.required]],
      event_time: [''],
      location: [''],
      expected_attendance: ['', [Validators.min(1)]],
      notes: ['']
    });
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const eventData = this.eventForm.value;

    this.attendanceService.createAttendanceEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          setTimeout(() => {
            this.router.navigate(['main/attendance', event.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create event. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/attendance']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
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
    if (control?.hasError('min')) {
      return 'Must be greater than 0';
    }
    return '';
  }
}
