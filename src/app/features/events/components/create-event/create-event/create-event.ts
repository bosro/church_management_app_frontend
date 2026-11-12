// src/app/features/events/components/create-event/create-event.component.ts
// KEY FIXES:
// 1. checkPermissions() now includes role-based fallback for pastors/leaders
// 2. Form control name changed from 'category' to 'event_type' to match the template
// 3. Form control name changed from 'registration_required' to 'requires_registration'
//    to match the template
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { ChurchEvent, EventCategory } from '../../../../../models/event.model';
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

  selectedFlyer: File | null = null;
  flyerPreview: string | null = null;
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
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const createRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
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
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(200),
        ],
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
      confirmation_sms_enabled: [false],
      confirmation_sms_template: ['', [Validators.maxLength(600)]],
      registration_id_prefix: ['', [Validators.maxLength(8)]],
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
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const formValue = this.eventForm.value;

    // FIX 1: Partial<ChurchEvent> not Partial<Event> (Event = DOM type)
    // FIX 2: formValue.event_type not formValue.category
    // FIX 3: formValue.requires_registration not formValue.registration_required
    const eventData = {
      title: formValue.title,
      description: formValue.description || undefined,
      category: formValue.event_type as EventCategory,
      start_date: formValue.start_date,
      end_date: formValue.end_date || undefined,
      location: formValue.location || undefined,
      max_attendees: formValue.max_attendees || undefined,
      registration_required: formValue.requires_registration || false,
      registration_deadline: formValue.registration_deadline || undefined,
      is_public: formValue.is_public !== undefined ? formValue.is_public : true,
      start_time: formValue.start_time || undefined,
      end_time: formValue.end_time || undefined,
      confirmation_sms_enabled: !!formValue.requires_registration && !!formValue.confirmation_sms_enabled,
      confirmation_sms_template: formValue.confirmation_sms_template?.trim() || undefined,
      registration_id_prefix: formValue.registration_id_prefix?.trim() || undefined,
      
    };

    this.eventsService
      .createEvent(eventData as any)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((event) => {
          if (this.selectedFlyer) {
            this.uploadingFlyer = true;
            return this.eventsService
              .uploadEventFlyer(event.id, this.selectedFlyer)
              .pipe(
                switchMap((flyerUrl) =>
                  this.eventsService
                    .updateEvent(event.id, {
                      flyer_url: flyerUrl,
                    } as Partial<ChurchEvent>)
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
          this.successMessage = 'Event created successfully!';
          setTimeout(
            () => this.router.navigate(['main/events', eventId]),
            1500,
          );
        },
        error: (error) => {
          this.loading = false;
          this.uploadingFlyer = false;
          this.handleError(error);
        },
      });
  }

  cancel(): void {
    if (this.eventForm.dirty) {
      if (
        confirm('You have unsaved changes. Are you sure you want to leave?')
      ) {
        this.router.navigate(['main/events']);
      }
    } else {
      this.router.navigate(['main/events']);
    }
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


