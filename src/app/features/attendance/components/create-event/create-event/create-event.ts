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

  // Permissions
  canManageAttendance = false;

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageAttendance = this.attendanceService.canManageAttendance();

    if (!this.canManageAttendance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      event_type: ['sunday_service', [Validators.required]],
      event_name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      event_date: [today, [Validators.required]],
      event_time: [''],
      location: ['', [Validators.maxLength(200)]],
      expected_attendance: ['', [Validators.min(1), Validators.max(10000)]],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    // Validate event date
    const eventDate = new Date(this.eventForm.value.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      this.errorMessage = 'Event date cannot be in the past';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const eventData = {
      event_type: this.eventForm.value.event_type,
      event_name: this.eventForm.value.event_name.trim(),
      event_date: this.eventForm.value.event_date,
      event_time: this.eventForm.value.event_time || undefined,
      location: this.eventForm.value.location?.trim() || undefined,
      expected_attendance: this.eventForm.value.expected_attendance || undefined,
      notes: this.eventForm.value.notes?.trim() || undefined
    };

    this.attendanceService
      .createAttendanceEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/attendance', event.id]);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create event. Please try again.';
          this.scrollToTop();
          console.error('Create error:', error);
        }
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/attendance']);
      }
    } else {
      this.router.navigate(['main/attendance']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
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
      return 'Must be greater than 0';
    }
    if (control.hasError('max')) {
      return 'Value is too large';
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
