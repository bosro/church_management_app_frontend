// src/app/features/attendance/components/create-event/create-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../../services/attendance.service';
import {
  AttendanceEventType,
  RecurrenceFrequency,
} from '../../../../../models/attendance.model';
import { PermissionService } from '../../../../../core/services/permission.service';

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

  eventTypes: { value: AttendanceEventType; label: string }[] = [
    { value: 'sunday_service', label: 'Sunday Service' },
    { value: 'midweek_service', label: 'Midweek Service' },
    { value: 'ministry_meeting', label: 'Ministry Meeting' },
    { value: 'special_event', label: 'Special Event' },
    { value: 'prayer_meeting', label: 'Prayer Meeting' },
  ];

  frequencies: { value: RecurrenceFrequency; label: string }[] = [
    { value: 'weekly', label: 'Every week' },
    { value: 'biweekly', label: 'Every 2 weeks' },
    { value: 'monthly', label: 'Monthly (same day)' },
  ];

  daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  canManageAttendance = false;

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router,
    public permissionService: PermissionService,
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
    this.canManageAttendance =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.manage;
    if (!this.canManageAttendance) this.router.navigate(['/unauthorized']);
  }

  private initForm(): void {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      event_type: ['sunday_service', [Validators.required]],
      event_name: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(200),
        ],
      ],
      event_date: [todayStr, [Validators.required]],
      event_time: [''],
      location: ['', [Validators.maxLength(200)]],
      expected_attendance: ['', [Validators.min(1), Validators.max(100000)]],
      notes: ['', [Validators.maxLength(1000)]],
      // Recurrence
      is_recurring: [false],
      recurrence_frequency: ['weekly'],
      recurrence_day_of_week: [today.getDay()],
    });

    // Auto-set recurrence day when date changes
    this.eventForm.get('event_date')?.valueChanges.subscribe((dateStr) => {
      if (dateStr) {
        const day = new Date(dateStr).getDay();
        this.eventForm.patchValue(
          { recurrence_day_of_week: day },
          { emitEvent: false },
        );
      }
    });
  }

  get isRecurring(): boolean {
    return this.eventForm.get('is_recurring')?.value === true;
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const v = this.eventForm.value;

    const eventData = {
      event_type: v.event_type,
      event_name: v.event_name.trim(),
      event_date: v.event_date,
      event_time: v.event_time || undefined,
      location: v.location?.trim() || undefined,
      expected_attendance: v.expected_attendance || undefined,
      notes: v.notes?.trim() || undefined,
      is_recurring: v.is_recurring,
      recurrence_frequency: v.is_recurring ? v.recurrence_frequency : undefined,
      recurrence_day_of_week: v.is_recurring
        ? v.recurrence_day_of_week
        : undefined,
    };

    this.attendanceService
      .createAttendanceEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          this.loading = false;
          setTimeout(
            () => this.router.navigate(['main/attendance', event.id]),
            1200,
          );
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create event';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (confirm('You have unsaved changes. Leave?')) {
        this.router.navigate(['main/attendance']);
      }
    } else {
      this.router.navigate(['main/attendance']);
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.eventForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    if (control.hasError('min')) return 'Must be greater than 0';
    if (control.hasError('max')) return 'Value is too large';
    return 'Invalid input';
  }

  private markFormGroupTouched(fg: FormGroup): void {
    Object.values(fg.controls).forEach((c) => {
      c.markAsTouched();
      if (c instanceof FormGroup) this.markFormGroupTouched(c);
    });
  }
}
