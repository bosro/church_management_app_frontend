// src/app/features/attendance/components/create-event/create-event.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AttendanceService } from '../../../services/attendance.service';
import { AttendanceEventType, RecurrenceFrequency } from '../../../../../models/attendance.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';

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
    { value: 'sunday_service',   label: 'Sunday Service' },
    { value: 'midweek_service',  label: 'Midweek Service' },
    { value: 'ministry_meeting', label: 'Ministry Meeting' },
    { value: 'special_event',    label: 'Special Event' },
    { value: 'prayer_meeting',   label: 'Prayer Meeting' },
  ];

  frequencies: { value: RecurrenceFrequency; label: string; description: string }[] = [
    { value: 'daily',     label: 'Daily',           description: 'Every day (e.g. a week-long program)' },
    { value: 'weekly',    label: 'Weekly',           description: 'Once a week on selected day(s)' },
    { value: 'biweekly',  label: 'Every 2 weeks',   description: 'Every other week on selected day(s)' },
    { value: 'monthly',   label: 'Monthly',          description: 'Once a month on the same date' },
  ];

  daysOfWeek = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];

  // Which days are checked in the multi-day selector
  selectedDays: Set<number> = new Set();

  canManageAttendance = false;

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
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
    const role = this.authService.getCurrentUserRole();
    const manageRoles = ['pastor','senior_pastor','associate_pastor','ministry_leader','group_leader'];
    this.canManageAttendance =
      this.permissionService.isAdmin ||
      this.permissionService.attendance.manage ||
      manageRoles.includes(role);
    if (!this.canManageAttendance) this.router.navigate(['/unauthorized']);
  }

  private initForm(): void {
    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      event_type:           ['sunday_service', [Validators.required]],
      event_name:           ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      event_date:           [todayStr, [Validators.required]],
      event_time:           [''],
      location:             ['', [Validators.maxLength(200)]],
      expected_attendance:  ['', [Validators.min(1), Validators.max(100000)]],
      notes:                ['', [Validators.maxLength(1000)]],
      // Recurrence
      is_recurring:         [false],
      recurrence_frequency: ['weekly'],
      recurrence_end_date:  [''],   // ← new
    });

    // Seed selected days with today's weekday when the date changes
    this.selectedDays.clear();
    this.selectedDays.add(today.getDay());

    this.eventForm.get('event_date')?.valueChanges.subscribe((dateStr) => {
      if (dateStr) {
        const day = new Date(dateStr + 'T00:00:00').getDay();
        // Only auto-set if user hasn't manually chosen days yet
        if (this.selectedDays.size === 0) {
          this.selectedDays.add(day);
        }
      }
    });
  }

  // ── Computed ────────────────────────────────────────────────
  get isRecurring(): boolean {
    return this.eventForm.get('is_recurring')?.value === true;
  }

  get selectedFrequency(): RecurrenceFrequency {
    return this.eventForm.get('recurrence_frequency')?.value;
  }

  get showDaySelector(): boolean {
    return this.isRecurring && this.selectedFrequency !== 'daily' && this.selectedFrequency !== 'monthly';
  }

  get showEndDate(): boolean {
    return this.isRecurring;
  }

  // ── Day toggle ──────────────────────────────────────────────
  toggleDay(day: number): void {
    if (this.selectedDays.has(day)) {
      // Don't allow deselecting the last day
      if (this.selectedDays.size > 1) this.selectedDays.delete(day);
    } else {
      this.selectedDays.add(day);
    }
  }

  isDaySelected(day: number): boolean {
    return this.selectedDays.has(day);
  }

  // ── Submit ──────────────────────────────────────────────────
  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.markFormGroupTouched(this.eventForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (this.isRecurring && this.showDaySelector && this.selectedDays.size === 0) {
      this.errorMessage = 'Please select at least one day of the week';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const v = this.eventForm.value;

    const eventData = {
      event_type:              v.event_type,
      event_name:              v.event_name.trim(),
      event_date:              v.event_date,
      event_time:              v.event_time || undefined,
      location:                v.location?.trim() || undefined,
      expected_attendance:     v.expected_attendance || undefined,
      notes:                   v.notes?.trim() || undefined,
      is_recurring:            v.is_recurring,
      recurrence_frequency:    v.is_recurring ? v.recurrence_frequency : undefined,
      recurrence_days_of_week: v.is_recurring && this.showDaySelector
                                ? Array.from(this.selectedDays).sort()
                                : undefined,
      recurrence_end_date:     v.is_recurring && v.recurrence_end_date
                                ? v.recurrence_end_date
                                : null,
    };

    this.attendanceService
      .createAttendanceEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          this.loading = false;
          setTimeout(() => this.router.navigate(['main/attendance', event.id]), 1200);
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
      if (confirm('You have unsaved changes. Leave?')) this.router.navigate(['main/attendance']);
    } else {
      this.router.navigate(['main/attendance']);
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.eventForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required'))   return 'This field is required';
    if (control.hasError('minlength'))  return `Minimum ${control.getError('minlength').requiredLength} characters`;
    if (control.hasError('maxlength'))  return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    if (control.hasError('min'))        return 'Must be greater than 0';
    if (control.hasError('max'))        return 'Value is too large';
    return 'Invalid input';
  }

  private markFormGroupTouched(fg: FormGroup): void {
    Object.values(fg.controls).forEach((c) => {
      c.markAsTouched();
      if (c instanceof FormGroup) this.markFormGroupTouched(c);
    });
  }

  // ── Summary sentence shown in the info box ─────────────────
  getRecurrenceSummary(): string {
    const freq = this.selectedFrequency;
    const endDate = this.eventForm.get('recurrence_end_date')?.value;
    const endStr = endDate
      ? ` until ${new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : ' with no end date';

    if (freq === 'daily') return `Runs every day${endStr}.`;

    if (freq === 'monthly') return `Repeats monthly on the same date${endStr}.`;

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chosen = Array.from(this.selectedDays).sort().map(d => dayNames[d]).join(' & ');
    const freqLabel = freq === 'weekly' ? 'weekly' : 'every 2 weeks';
    return `Repeats ${freqLabel} on ${chosen}${endStr}.`;
  }
}
