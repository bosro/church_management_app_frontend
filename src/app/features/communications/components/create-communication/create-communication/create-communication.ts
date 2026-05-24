// src/app/features/communications/components/create-communication/create-communication.component.ts
// CHANGES:
// 1. Added 'member' to TargetAudience options
// 2. Member search — debounced input using MemberService.searchMembers()
// 3. target_member_id field wired to selected member
// 4. Progress bar shown after send is triggered — polls every 2s via pollSendProgress()
// 5. Subscription is unsubscribed on destroy

import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { CommunicationsService, SendProgress } from '../../../services/communications';
import {
  CommunicationType,
  TargetAudience,
} from '../../../../../models/communication.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { MemberService } from '../../../../members/services/member.service';
import { Member } from '../../../../../models/member.model';

interface MessageTemplate {
  name: string;
  message: string;
}

@Component({
  selector: 'app-create-communication',
  standalone: false,
  templateUrl: './create-communication.html',
  styleUrl: './create-communication.scss',
})
export class CreateCommunication implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private progressSub?: Subscription;

  Math = Math;

  communicationForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // ── Member search state ──────────────────────────────────────────
  memberSearchQuery = '';
  memberSearchResults: Member[] = [];
  selectedMember: Member | null = null;
  searchingMembers = false;
  showMemberDropdown = false;
  private memberSearch$ = new Subject<string>();

  // ── Send progress state ──────────────────────────────────────────
  sendProgress: SendProgress | null = null;
  sending = false;

  communicationTypes: { value: CommunicationType; label: string }[] = [
    { value: 'sms', label: 'SMS Only' },
    { value: 'email', label: 'Email Only' },
    { value: 'both', label: 'SMS & Email' },
  ];

  targetAudiences: { value: TargetAudience; label: string; icon: string }[] = [
    { value: 'all', label: 'All Members', icon: 'ri-group-line' },
    { value: 'members', label: 'Active Members', icon: 'ri-user-check-line' },
    { value: 'member', label: 'Single Member', icon: 'ri-user-line' },
    { value: 'groups', label: 'Specific Groups', icon: 'ri-team-line' },
    { value: 'custom', label: 'Custom List', icon: 'ri-list-check' },
  ];

  messageTemplates: MessageTemplate[] = [
    {
      name: 'Service Reminder',
      message: 'Dear {name}, this is a reminder about our service on {date} at {time}. We look forward to seeing you!',
    },
    {
      name: 'Event Announcement',
      message: 'Exciting news! Join us for {event_name} on {date}. Register now to secure your spot.',
    },
    {
      name: 'Birthday Wishes',
      message: 'Happy Birthday {name}! May God bless you abundantly on this special day and always.',
    },
    {
      name: 'Offering Thank You',
      message: 'Thank you {name} for your generous offering of {amount}. Your support makes a difference!',
    },
    {
      name: 'Weekly Newsletter',
      message: 'This week at church: {event_name}. Join us as we grow together in faith. See you there!',
    },
    {
      name: 'Prayer Request Response',
      message: 'Dear {name}, we are praying for you. Remember that God is with you always.',
    },
  ];

  canManageCommunications = false;

  constructor(
    private fb: FormBuilder,
    private communicationsService: CommunicationsService,
    private memberService: MemberService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.setupMemberSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.progressSub?.unsubscribe();
  }

  // ── Member search setup ──────────────────────────────────────────

  private setupMemberSearch(): void {
    this.memberSearch$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || query.length < 2) {
          this.memberSearchResults = [];
          this.searchingMembers = false;
          return [];
        }
        this.searchingMembers = true;
        return this.memberService.searchMembers(query, 8);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (results) => {
        this.memberSearchResults = results;
        this.searchingMembers = false;
        this.showMemberDropdown = results.length > 0;
      },
      error: () => {
        this.searchingMembers = false;
        this.memberSearchResults = [];
      },
    });
  }

  onMemberSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.memberSearchQuery = value;
    if (!value) {
      this.clearSelectedMember();
    }
    this.memberSearch$.next(value);
  }

  selectMember(member: Member): void {
    this.selectedMember = member;
    this.memberSearchQuery = `${member.first_name} ${member.last_name}`;
    this.showMemberDropdown = false;
    this.memberSearchResults = [];
  }

  clearSelectedMember(): void {
    this.selectedMember = null;
    this.memberSearchQuery = '';
    this.showMemberDropdown = false;
    this.memberSearchResults = [];
  }

  onMemberSearchBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      this.showMemberDropdown = false;
    }, 200);
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  get isSingleMemberTarget(): boolean {
    return this.communicationForm.get('target_audience')?.value === 'member';
  }

  // ── Permissions ──────────────────────────────────────────────────

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const sendRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'ministry_leader'];

    this.canManageCommunications =
      this.permissionService.isAdmin ||
      this.permissionService.communications.send ||
      this.permissionService.communications.bulk ||
      sendRoles.includes(role);

    if (!this.canManageCommunications) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.communicationForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
      communication_type: ['sms' as CommunicationType, [Validators.required]],
      target_audience: ['all' as TargetAudience, [Validators.required]],
      scheduled_at: [''],
    });

    this.communicationForm.get('communication_type')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.validateMessageLength());

    this.communicationForm.get('message')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.validateMessageLength());

    // Clear member selection when target audience changes away from 'member'
    this.communicationForm.get('target_audience')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        if (val !== 'member') {
          this.clearSelectedMember();
        }
      });
  }

  private validateMessageLength(): void {
    const type = this.communicationForm.get('communication_type')?.value;
    const message = this.communicationForm.get('message')?.value || '';
    if ((type === 'sms' || type === 'both') && message.length > 480) {
      console.warn('SMS message is quite long and may be expensive');
    }
  }

  applyTemplate(template: MessageTemplate): void {
    this.communicationForm.patchValue({
      title: template.name,
      message: template.message,
    });
  }

  // ── Submit ───────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.communicationForm.invalid) {
      this.markFormGroupTouched(this.communicationForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    if (this.isSingleMemberTarget && !this.selectedMember) {
      this.errorMessage = 'Please select a member to send to';
      this.scrollToTop();
      return;
    }

    if (this.communicationForm.value.scheduled_at) {
      const scheduledDate = new Date(this.communicationForm.value.scheduled_at);
      if (scheduledDate <= new Date()) {
        this.errorMessage = 'Scheduled date must be in the future';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.sending = false;
    this.sendProgress = null;
    this.errorMessage = '';
    this.successMessage = '';

    const communicationData = {
      title: this.communicationForm.value.title.trim(),
      message: this.communicationForm.value.message.trim(),
      communication_type: this.communicationForm.value.communication_type,
      target_audience: this.communicationForm.value.target_audience,
      scheduled_at: this.communicationForm.value.scheduled_at || undefined,
      target_member_id: this.selectedMember?.id || null,
    };

    this.communicationsService
      .createCommunication(communicationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (communication) => {
          if (!communicationData.scheduled_at) {
            this.triggerSendWithProgress(
              communication.id,
              communicationData.communication_type,
            );
          } else {
            this.loading = false;
            this.successMessage = 'Message scheduled successfully!';
            setTimeout(() => this.router.navigate(['main/communications']), 1500);
          }
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create message. Please try again.';
          this.scrollToTop();
        },
      });
  }

  private triggerSendWithProgress(
    communicationId: string,
    type: CommunicationType,
  ): void {
    this.sending = true;
    this.sendProgress = { total: 0, sent: 0, failed: 0, percent: 0, done: false };

    this.communicationsService
      .sendCommunication(communicationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Edge function returned — now poll for log progress
          this.startPolling(communicationId, type);
        },
        error: (error) => {
          this.loading = false;
          this.sending = false;
          this.errorMessage = error.message || 'Failed to send message';
          this.scrollToTop();
        },
      });
  }

  private startPolling(communicationId: string, type: CommunicationType): void {
    this.progressSub?.unsubscribe();

    this.progressSub = this.communicationsService
      .pollSendProgress(communicationId, type, 2000, 60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          this.sendProgress = progress;

          if (progress.done) {
            this.loading = false;
            this.sending = false;

            if (progress.failed === 0 && progress.sent > 0) {
              this.successMessage = `Message sent successfully to ${progress.sent} recipient${progress.sent > 1 ? 's' : ''}!`;
            } else if (progress.failed > 0 && progress.sent > 0) {
              this.successMessage = `Sent to ${progress.sent} recipient${progress.sent > 1 ? 's' : ''}. ${progress.failed} failed.`;
            } else if (progress.failed > 0 && progress.sent === 0) {
              this.errorMessage = `Send failed — ${progress.failed} message${progress.failed > 1 ? 's' : ''} could not be delivered.`;
            } else {
              this.successMessage = 'Message sent successfully!';
            }

            setTimeout(() => this.router.navigate(['main/communications']), 2500);
          }
        },
        error: () => {
          this.loading = false;
          this.sending = false;
          this.successMessage = 'Message sent. Check SMS/Email logs for delivery status.';
          setTimeout(() => this.router.navigate(['main/communications']), 2000);
        },
      });
  }

  cancel(): void {
    if (this.communicationForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/communications']);
      }
    } else {
      this.router.navigate(['main/communications']);
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
    const control = this.communicationForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength')) {
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      return `Maximum ${control.getError('maxlength').requiredLength} characters allowed`;
    }
    return 'Invalid input';
  }

  getCharacterCount(): number {
    return this.communicationForm.get('message')?.value?.length || 0;
  }

  getSmsSegmentCount(): number {
    return this.communicationsService.estimateSmsCount(
      this.communicationForm.get('message')?.value || '',
    );
  }

  getProgressBarColor(): string {
    if (!this.sendProgress) return '#5B21B6';
    if (this.sendProgress.failed > 0 && this.sendProgress.sent === 0) return '#DC2626';
    if (this.sendProgress.failed > 0) return '#F59E0B';
    return '#059669';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
