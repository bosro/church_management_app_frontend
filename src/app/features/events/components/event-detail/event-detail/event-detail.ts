// src/app/features/events/components/event-detail/event-detail.component.ts
// KEY FIX: checkPermissions() now includes role-based fallback
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { EventsService } from '../../../services/events';
import { ChurchEvent, EventCategory } from '../../../../../models/event.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';

import { copyToClipboard, eventRegistrationUrl } from '../../../../../core/utils/copy-to-clipboard';

import { RequiresPlan } from '../../../../../core/plan-gate';
import { ToastService } from '../../../../../core/services/toast.service';
@Component({
  selector: 'app-event-detail',
  standalone: false,
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
})
export class EventDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  eventId: string = '';
  event: ChurchEvent | null = null;
  registrations: any[] = [];
  statistics: any = null;
  loading = true;
  errorMessage = '';
  successMessage = '';

  showRegistrationForm = false;
  searchControl = new FormControl('');
  searchResults: any[] = [];
  searching = false;
  selectedMember: any = null;
  guestName = '';
  guestEmail = '';
  guestPhone = '';
  registrationNotes = '';
  registering = false;

  canManageEvents = false;

  linkCopied = false;
  showQr = false;

  undoTarget: any = null;
  undoing = false;


  sendingSms = false;
  smsMessage = '';

  sendingSmsId: string | null = null;   // which registration is being sent right now
  smsResendTarget: any = null;


  contactTarget: any = null;
  contactPhone = '';
  contactEmail = '';
  contactSendNow = true;
  contactSaving = false;
  contactError = '';


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventsService: EventsService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private toast: ToastService,
  ) { }

  ngOnInit(): void {
    this.checkPermissions();
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    if (this.eventId) {
      this.loadEventDetails();
      this.setupMemberSearch();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const viewRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'finance_officer',
      'elder',
      'deacon',
      'worship_leader',
      'secretary',
    ];

    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
    ];

    const canView =
      this.permissionService.isAdmin ||
      this.permissionService.events.view ||
      viewRoles.includes(role);

    this.canManageEvents =
      this.permissionService.isAdmin ||
      this.permissionService.events.edit ||
      this.permissionService.events.delete ||
      manageRoles.includes(role);

    if (!canView) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadEventDetails(): void {
    this.loading = true;
    this.errorMessage = '';

    this.eventsService
      .getEventById(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          this.event = event;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load event';
          this.loading = false;
        },
      });

    this.loadRegistrations();
    this.loadStatistics();
  }

  private loadRegistrations(): void {
    this.eventsService
      .getEventRegistrations(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (registrations) => {
          this.registrations = registrations;
        },
        error: (error) => {
          console.error('Error loading registrations:', error);
        },
      });
  }

  private loadStatistics(): void {
    this.eventsService
      .getEventStatistics(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
        },
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.eventsService.searchMembersForEvent(this.eventId, query);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
          this.searchResults = [];
        },
      });
  }

  toggleRegistrationForm(): void {
    this.showRegistrationForm = !this.showRegistrationForm;
    if (!this.showRegistrationForm) this.resetRegistrationForm();
  }

  selectMember(member: any): void {
    this.selectedMember = member;
    this.searchControl.setValue('', { emitEvent: false });
    this.searchResults = [];
  }

  removeSelectedMember(): void {
    this.selectedMember = null;
  }

  registerAttendee(): void {
    if (!this.selectedMember && (!this.guestName || !this.guestEmail)) {
      this.errorMessage =
        'Please select a member or provide guest details (name and email required)';
      setTimeout(() => (this.errorMessage = ''), 5000);
      return;
    }

    if (!this.selectedMember && this.guestEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.guestEmail)) {
        this.errorMessage = 'Please provide a valid email address';
        setTimeout(() => (this.errorMessage = ''), 5000);
        return;
      }
    }

    this.registering = true;
    this.errorMessage = '';
    this.successMessage = '';

    const registrationData: any = {};

    if (this.selectedMember) {
      registrationData.memberId = this.selectedMember.id;
    } else {
      registrationData.name = this.guestName.trim();
      registrationData.email = this.guestEmail.trim();
      registrationData.phone = this.guestPhone.trim() || undefined;
    }

    if (this.registrationNotes.trim()) {
      registrationData.notes = this.registrationNotes.trim();
    }

    this.eventsService
      .registerForEvent(this.eventId, registrationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration successful!';
          this.loadRegistrations();
          this.loadStatistics();
          this.toggleRegistrationForm();
          this.registering = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to register';
          this.registering = false;
        },
      });
  }

  checkInRegistration(registrationId: string): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to check in attendees';
      return;
    }
    this.eventsService
      .checkInRegistration(registrationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Attendee checked in successfully!';
          this.loadRegistrations();
          this.loadStatistics();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to check in';
        },
      });
  }

  cancelRegistration(registrationId: string): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to cancel registrations';
      return;
    }
    if (!confirm('Are you sure you want to cancel this registration?')) return;

    this.eventsService
      .cancelRegistration(registrationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Registration cancelled successfully!';
          this.loadRegistrations();
          this.loadStatistics();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to cancel registration';
        },
      });
  }

  private resetRegistrationForm(): void {
    this.selectedMember = null;
    this.guestName = '';
    this.guestEmail = '';
    this.guestPhone = '';
    this.registrationNotes = '';
    this.searchControl.setValue('', { emitEvent: false });
    this.searchResults = [];
  }

  @RequiresPlan('export')

  exportRegistrations(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to export registrations';
      return;
    }
    this.eventsService
      .exportEventRegistrations(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.event?.title || 'event'}_registrations_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.successMessage = 'Registrations exported successfully!';
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export registrations';
        },
      });
  }

  /** Copies the public registration link so it can be shared (WhatsApp, SMS, etc.) */
  async copyRegistrationLink(): Promise<void> {
    if (!this.event) return;
    const ok = await copyToClipboard(eventRegistrationUrl(this.event.id));
    if (ok) {
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2500);
    } else {
      this.errorMessage = 'Could not copy automatically. Link: ' + eventRegistrationUrl(this.event.id);
    }
  }

  goBack(): void {
    this.router.navigate(['main/events']);
  }

  editEvent(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to edit events';
      return;
    }
    this.router.navigate(['main/events', this.eventId, 'edit']);
  }

  deleteEvent(): void {
    if (!this.canManageEvents) {
      this.errorMessage = 'You do not have permission to delete events';
      return;
    }
    if (
      !confirm(
        'Are you sure you want to delete this event? This action cannot be undone. All registrations will also be deleted.',
      )
    )
      return;

    this.eventsService
      .deleteEvent(this.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['main/events']);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete event';
        },
      });
  }

  getEventCategoryLabel(category?: EventCategory): string {
    if (!category) return 'Other';
    const categoryMap: Record<EventCategory, string> = {
      service: 'Service',
      meeting: 'Meeting',
      conference: 'Conference',
      seminar: 'Seminar',
      retreat: 'Retreat',
      workshop: 'Workshop',
      outreach: 'Outreach',
      social: 'Social',
      youth: 'Youth',
      children: 'Children',
      other: 'Other',
    };
    return categoryMap[category] || 'Other';
  }

  getEventCategoryClass(category?: EventCategory): string {
    if (!category) return 'type-other';
    const classMap: Record<EventCategory, string> = {
      service: 'type-service',
      meeting: 'type-meeting',
      conference: 'type-conference',
      seminar: 'type-seminar',
      retreat: 'type-retreat',
      workshop: 'type-workshop',
      outreach: 'type-outreach',
      social: 'type-social',
      youth: 'type-youth',
      children: 'type-children',
      other: 'type-other',
    };
    return classMap[category] || 'type-other';
  }

  formatDateRange(event: ChurchEvent): string {
    const start = new Date(event.start_date);
    const end = new Date(event.end_date || event.start_date);
    const startDateStr = event.start_date.split('T')[0];
    const endDateStr = (event.end_date || event.start_date).split('T')[0];

    if (startDateStr === endDateStr) {
      return start.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  getAttendeeName(registration: any): string {
    if (registration.member)
      return `${registration.member.first_name} ${registration.member.last_name}`;
    return registration.name || 'Guest';
  }

  getAttendeeInitials(registration: any): string {
    if (registration.member)
      return `${registration.member.first_name[0]}${registration.member.last_name[0]}`.toUpperCase();
    if (registration.name) {
      const names = registration.name.split(' ');
      return names.length > 1
        ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
        : registration.name[0].toUpperCase();
    }
    return 'G';
  }

  getMemberName(member: any): string {
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: any): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  openFlyerLightbox(): void {
    if (this.event?.flyer_url) {
      window.open(this.event.flyer_url, '_blank');
    }
  }

  /** People we can still message: have a phone, not cancelled, and not sent yet. */
  get smsPendingCount(): number {
    if (!this.event?.confirmation_sms_enabled) return 0;
    return this.registrations.filter(
      (r) => (r.phone || r.email) && r.status !== 'cancelled' && r.sms_status !== 'sent' && r.sms_status !== 'sending',
    ).length;
  }




  confirmResend(): void {
    const reg = this.smsResendTarget;
    if (reg) this.doSendSms(reg);
  }

  cancelResend(): void {
    if (!this.sendingSmsId) this.smsResendTarget = null;
  }

  private async doSendSms(reg: any): Promise<void> {
    if (this.sendingSmsId) return;
    this.sendingSmsId = reg.id;
    this.smsResendTarget = null;                       // close the modal straight away
    const who = `${this.getAttendeeName(reg)} (${reg.phone})`;
    const wait = this.toast.info('Sending SMS…', `Sending to ${who}. Please wait a few seconds.`, 60000);
    try {
      const r = await this.eventsService.sendRegistrationSms({ registration_id: reg.id, resend: true });
      this.toast.dismiss(wait);
      if (r?.status === 'sent') {
        this.toast.success('SMS sent', `Confirmation sent to ${who}.`);
      } else {
        this.toast.warning('SMS not sent', r?.detail || 'Nothing was sent for this person.');
      }
    } catch (e: any) {
      this.toast.dismiss(wait);
      this.toast.error('SMS failed', e?.message || 'Could not send the SMS.');
    }
    this.sendingSmsId = null;
    this.loadRegistrations();
  }


  async sendPendingSms(): Promise<void> {
    const n = this.smsPendingCount;
    if (!n || this.sendingSms) return;
    if (!confirm(`Send the confirmation SMS to ${n} registered ${n === 1 ? 'person' : 'people'}? Anyone without an ID number will be given one first. This uses SMS credits.`)) return;
    this.sendingSms = true;
    this.smsMessage = '';
    let sent = 0, failed = 0, stopped = '';
    try {
      for (let i = 0; i < 20; i++) {
        const r = await this.eventsService.sendRegistrationSms({ event_id: this.eventId, send_pending: true });
        sent += r.sent || 0; failed += r.failed || 0;
        if (r.stopped) { stopped = r.stopped; break; }
        if (!r.more) break;
      }
      if (stopped) this.toast.warning('Sending stopped', `${stopped}. Sent ${sent} before stopping.`);
      else if (failed) this.toast.warning('Finished with problems', `Sent ${sent}, ${failed} failed. See the SMS note on each card.`);
      else this.toast.success('SMS sent', `Confirmation sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`);
    } catch (e: any) {
      this.toast.error('SMS failed', e?.message || 'Could not send the SMS messages.');
    }
    this.sendingSms = false;
    this.loadRegistrations();
  }

  /** Resend button: asks first if this person was already sent the SMS. */
  resendSms(reg: any): void {
    if (this.sendingSmsId) return;
    if (reg.sms_status === 'sent') {
      this.smsResendTarget = reg;       // opens the confirmation modal
      return;
    }
    this.doSendSms(reg);
  }



  openGate(): void {
    this.router.navigate(['main', 'events', this.eventId, 'check-in']);
  }

  askUndoCheckIn(reg: any): void {
    this.undoTarget = reg;
  }

  cancelUndoCheckIn(): void {
    if (!this.undoing) this.undoTarget = null;
  }

  async confirmUndoCheckIn(): Promise<void> {
    const reg = this.undoTarget;
    if (!reg || this.undoing) return;
    this.undoing = true;
    try {
      await this.eventsService.undoCheckIn(reg.id);
      this.toast.success('Check-in undone', `${this.getAttendeeName(reg)} is no longer marked as checked in.`);
    } catch (e: any) {
      this.toast.error('Could not undo', e?.message || 'Please try again.');
    }
    this.undoing = false;
    this.undoTarget = null;
    this.loadRegistrations();
    this.loadStatistics();
  }



  openEditContact(reg: any): void {
    this.contactTarget = reg;
    this.contactPhone = reg.phone || '';
    this.contactEmail = reg.email || '';
    this.contactSendNow = reg.sms_status !== 'sent';   // tick by default only if they haven't been messaged yet
    this.contactError = '';
  }

  cancelEditContact(): void {
    if (!this.contactSaving) this.contactTarget = null;
  }

  async saveContact(): Promise<void> {
    const reg = this.contactTarget;
    if (!reg || this.contactSaving) return;
    this.contactSaving = true;
    this.contactError = '';
    try {
      const saved = await this.eventsService.updateRegistrationContact(reg.id, this.contactPhone, this.contactEmail);
      this.toast.success('Contact saved', `${this.getAttendeeName(reg)}'s details were updated.`);
      const sendNow = this.contactSendNow;
      this.contactTarget = null;
      this.contactSaving = false;
      this.loadRegistrations();
      if (sendNow && this.event?.confirmation_sms_enabled) {
        await this.doSendSms({ ...reg, phone: saved.phone, email: saved.email });
      }
      return;
    } catch (e: any) {
      this.contactError = e?.message || 'Could not save. Please try again.';
    }
    this.contactSaving = false;
  }
}




