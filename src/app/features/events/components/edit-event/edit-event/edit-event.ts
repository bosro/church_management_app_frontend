// src/app/features/events/components/edit-event/edit-event.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
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

  selectedFlyer: File | null = null;
  flyerPreview: string | null = null;
  existingFlyerUrl: string | null = null; // ← holds the DB value
  uploadingFlyer = false;
  flyerError = '';



  readonly smsPlaceholders = ['{name}', '{first_name}', '{event}', '{date}', '{time}', '{location}', '{id}', '{church_name}'];

  readonly smsExample =
    'Thank you {name} for registering for the {event} on {date} at {time}. Your ID Number is {id}\n\n' +
    'Kindly pay $5 (GHS 60 or above) as your level of support, or feel free to sponsor the seminar.\n\n' +
    'Payment Details: Momo 0244564343 (Ernest Osei-Nimako)\n\n' +
    'Please whatsapp your payment confirmation to 0244564343. Thank you for your support, see you there!';



  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) { }


  insertPlaceholder(token: string, box: HTMLTextAreaElement): void {
    const ctl = this.eventForm.get('confirmation_sms_template')!;
    const cur: string = ctl.value || '';
    const s = box.selectionStart ?? cur.length;
    const e = box.selectionEnd ?? cur.length;
    ctl.setValue(cur.slice(0, s) + token + cur.slice(e));
    ctl.markAsDirty();
    setTimeout(() => { box.focus(); box.setSelectionRange(s + token.length, s + token.length); });
  }

  useSmsExample(): void {
    this.eventForm.get('confirmation_sms_template')!.setValue(this.smsExample);
  }

  /** Rough SMS length: GSM text = 160 per part (153 if several); anything else (e.g. the cedi sign) = 70 per part (67). */
  get smsInfo(): { chars: number; parts: number; unicode: boolean } {
    const t: string = this.eventForm.get('confirmation_sms_template')?.value || '';
    const unicode = /[^\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]/.test(t);
    const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
    const parts = t.length === 0 ? 0 : t.length <= single ? 1 : Math.ceil(t.length / multi);
    return { chars: t.length, parts, unicode };
  }


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
      confirmation_sms_enabled: [false],
      confirmation_sms_template: ['', [Validators.maxLength(600)]],
      registration_id_prefix: ['', [Validators.maxLength(8)]],
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

  onFlyerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    // Validate type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.flyerError = 'Please select a valid image (JPEG, PNG, GIF, or WebP)';
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.flyerError = 'Image must be less than 5MB';
      return;
    }

    this.selectedFlyer = file;
    this.flyerError = '';

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.flyerPreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeFlyer(): void {
    this.selectedFlyer = null;
    this.flyerPreview = null;
    this.flyerError = '';
    this.existingFlyerUrl = null; // Mark as removed
  }

  private populateForm(event: ChurchEvent): void {
    const startDate = event.start_date ? event.start_date.split('T')[0] : '';
    const endDate = event.end_date ? event.end_date.split('T')[0] : startDate;
    const startTime = event.start_date
      ? this.extractTime(event.start_date)
      : '';
    const endTime = event.end_date ? this.extractTime(event.end_date) : '';

    if (event.flyer_url) {
      this.flyerPreview = event.flyer_url;
      this.existingFlyerUrl = event.flyer_url;
    }

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
      confirmation_sms_enabled: event.confirmation_sms_enabled || false,
      confirmation_sms_template: event.confirmation_sms_template || '',
      registration_id_prefix: event.registration_id_prefix || '',
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
    const eventData: any = {
      title: v.title.trim(),
      description: v.description?.trim() || undefined,
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

      confirmation_sms_enabled: !!v.requires_registration && !!v.confirmation_sms_enabled,
      confirmation_sms_template: v.confirmation_sms_template?.trim() || null,
      registration_id_prefix: v.registration_id_prefix?.trim() || null,
      // Move flyer_url INSIDE the object instead of assigning after:
      flyer_url:
        !this.existingFlyerUrl && !this.selectedFlyer ? null : undefined,
    };

    if (!this.existingFlyerUrl && !this.selectedFlyer) {
      eventData.flyer_url = null;
    }

    this.eventsService
      .updateEvent(this.eventId, eventData)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((event) => {
          if (this.selectedFlyer) {
            // New flyer selected — upload it
            this.uploadingFlyer = true;
            return this.eventsService
              .uploadEventFlyer(event.id, this.selectedFlyer)
              .pipe(
                switchMap((flyerUrl) =>
                  this.eventsService
                    .updateEvent(event.id, { flyer_url: flyerUrl })
                    .pipe(map(() => event.id)),
                ),
                catchError(() => of(event.id)),
              );
          }
          return of(event.id);
        }),
      )
      .subscribe({
        next: (eventId) => {
          this.loading = false;
          this.uploadingFlyer = false;
          this.successMessage = 'Event updated successfully!';
          setTimeout(
            () => this.router.navigate(['main/events', eventId]),
            1500,
          );
        },
        error: (error) => {
          this.loading = false;
          this.uploadingFlyer = false;
          this.errorMessage = error.message || 'Failed to update event';
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
