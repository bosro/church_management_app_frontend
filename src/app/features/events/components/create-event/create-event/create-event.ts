// src/app/features/events/components/create-event/create-event.component.ts
// KEY FIXES:
// 1. checkPermissions() now includes role-based fallback for pastors/leaders
// 2. Form control name changed from 'category' to 'event_type' to match the template
// 3. Form control name changed from 'registration_required' to 'requires_registration'
//    to match the template
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { EventCategory } from '../../../../../models/event.model';
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

  showUpgradeModal = false;
  upgradeModalTrigger = '';

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
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

    const createRoles = [
      'pastor', 'senior_pastor', 'associate_pastor', 'ministry_leader',
    ];

    this.canManageEvents =
      this.permissionService.isAdmin ||
      this.permissionService.events.create ||
      createRoles.includes(role);

    if (!this.canManageEvents) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      title: [
        '',
        [Validators.required, Validators.minLength(3), Validators.maxLength(200)],
      ],
      description: ['', [Validators.maxLength(2000)]],
      // FIX: was 'category', template uses 'event_type'
      event_type: ['service' as EventCategory, [Validators.required]],
      start_date: [today, [Validators.required]],
      end_date: [today, [Validators.required]],
      start_time: [''],
      end_time: [''],
      location: ['', [Validators.maxLength(200)]],
      max_attendees: [null, [Validators.min(1)]],
      registration_deadline: [''],
      // FIX: was 'registration_required', template uses 'requires_registration'
      requires_registration: [false],
      is_public: [true],
    });
  }

  handleError(error: any, resourceLabel: string = 'item'): void {
    if (error.message?.startsWith('QUOTA_EXCEEDED:')) {
      const parts = error.message.split(':');
      const resource = parts[1];
      const limit = parts[3];

      const labels: Record<string, string> = {
        events: 'active event',
        ministries: 'department',
        forms: 'form',
      };

      const label = labels[resource] || resourceLabel;
      this.upgradeModalTrigger =
        `You've reached the ${limit} ${label} limit on your current plan. ` +
        `Upgrade to create more.`;
      this.showUpgradeModal = true;
      this.loading = false;
    } else {
      this.errorMessage = error.message || 'An error occurred';
      this.loading = false;
    }
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
      .createEvent(eventData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.successMessage = 'Event created successfully!';
          this.loading = false;
          setTimeout(() => {
            this.router.navigate(['main/events', event.id]);
          }, 1500);
        },
        error: (err) => {
          this.loading = false;
          this.handleError(err);
          this.scrollToTop();
        },
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/events']);
      }
    } else {
      this.router.navigate(['main/events']);
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
