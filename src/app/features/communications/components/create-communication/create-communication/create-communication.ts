// src/app/features/communications/components/create-communication/create-communication.component.ts
// CHANGES vs previous version:
// 1. Custom list multi-select: search + add multiple members to a list
// 2. customMemberIds[] tracked, sent as target_member_ids in createCommunication()
// 3. createCommunication() updated to pass custom_member_ids array
// 4. Single member ('member') flow unchanged
// 5. Progress bar + polling unchanged

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
import {
  RecipientGroupsService,
  RecipientGroup,
  ImportSourceType,
} from '../../../services/recipient-groups.service';
import {
  BulkMembershipService,
  BulkTarget,
} from '../../../../members/services/bulk-membership.service';

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

  // ── Single member search (target_audience = 'member') ─────────────────────
  memberSearchQuery = '';
  memberSearchResults: Member[] = [];
  selectedMember: Member | null = null;
  searchingMembers = false;
  showMemberDropdown = false;
  private memberSearch$ = new Subject<string>();

  // ── Custom list multi-select (target_audience = 'custom') ─────────────────
  customSearchQuery = '';
  customSearchResults: Member[] = [];
  customSelectedMembers: Member[] = [];   // the list being built
  searchingCustom = false;
  showCustomDropdown = false;
  private customSearch$ = new Subject<string>();

  // ── Saved recipient groups ────────────────────────────────────────────────
  savedGroups: RecipientGroup[] = [];
  loadingGroups = false;
  activeGroup: RecipientGroup | null = null; // group currently loaded into the list
  showSaveGroup = false;
  saveGroupName = '';
  savingGroup = false;
  confirmDeleteGroup = false;
  groupMessage = '';
  groupError = '';

  // Import from an existing cell / ministry / branch
  importType: ImportSourceType = 'cell';
  importTargets: BulkTarget[] = [];
  importTargetId = '';
  loadingImportTargets = false;
  importing = false;

  // ── Send progress ──────────────────────────────────────────────────────────
  sendProgress: SendProgress | null = null;
  sending = false;

  communicationTypes: { value: CommunicationType; label: string }[] = [
    { value: 'sms',   label: 'SMS Only' },
    { value: 'email', label: 'Email Only' },
    { value: 'both',  label: 'SMS & Email' },
  ];

  targetAudiences: { value: TargetAudience; label: string; icon: string; description: string }[] = [
    { value: 'all',     label: 'All Members',    icon: 'ri-group-line',       description: 'Active and inactive members' },
    { value: 'members', label: 'Active Members', icon: 'ri-user-check-line',  description: 'Active members only' },
    { value: 'member',  label: 'Single Member',  icon: 'ri-user-line',        description: 'Send to one specific member' },
    { value: 'custom',  label: 'Custom List',    icon: 'ri-list-check',       description: 'Search and select multiple members' },
  ];

  messageTemplates: MessageTemplate[] = [
    { name: 'Service Reminder',       message: 'Dear {name}, this is a reminder about our service on {date} at {time}. We look forward to seeing you!' },
    { name: 'Event Announcement',     message: 'Exciting news! Join us for {event_name} on {date}. Register now to secure your spot.' },
    { name: 'Birthday Wishes',        message: 'Happy Birthday {name}! May God bless you abundantly on this special day and always.' },
    { name: 'Offering Thank You',     message: 'Thank you {name} for your generous offering of {amount}. Your support makes a difference!' },
    { name: 'Weekly Newsletter',      message: 'This week at church: {event_name}. Join us as we grow together in faith. See you there!' },
    { name: 'Prayer Request Response',message: 'Dear {name}, we are praying for you. Remember that God is with you always.' },
  ];

  canManageCommunications = false;

  constructor(
    private fb: FormBuilder,
    private communicationsService: CommunicationsService,
    private memberService: MemberService,
    private recipientGroups: RecipientGroupsService,
    private bulkMembership: BulkMembershipService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.setupMemberSearch();
    this.setupCustomSearch();
    this.loadSavedGroups();
    this.loadImportTargets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.progressSub?.unsubscribe();
  }

  // ── Single member search ───────────────────────────────────────────────────

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
      error: () => { this.searchingMembers = false; this.memberSearchResults = []; },
    });
  }

  onMemberSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.memberSearchQuery = value;
    if (!value) this.clearSelectedMember();
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
    setTimeout(() => { this.showMemberDropdown = false; }, 200);
  }

  // ── Custom list multi-select ───────────────────────────────────────────────

  private setupCustomSearch(): void {
    this.customSearch$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || query.length < 2) {
          this.customSearchResults = [];
          this.searchingCustom = false;
          return [];
        }
        this.searchingCustom = true;
        return this.memberService.searchMembers(query, 10);
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (results) => {
        // Filter out already-selected members
        this.customSearchResults = results.filter(
          r => !this.customSelectedMembers.find(m => m.id === r.id),
        );
        this.searchingCustom = false;
        this.showCustomDropdown = this.customSearchResults.length > 0;
      },
      error: () => { this.searchingCustom = false; this.customSearchResults = []; },
    });
  }

  onCustomSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.customSearchQuery = value;
    this.customSearch$.next(value);
  }

  addToCustomList(member: Member): void {
    if (!this.customSelectedMembers.find(m => m.id === member.id)) {
      this.customSelectedMembers = [...this.customSelectedMembers, member];
    }
    this.customSearchQuery = '';
    this.customSearchResults = [];
    this.showCustomDropdown = false;
  }

  removeFromCustomList(memberId: string): void {
    this.customSelectedMembers = this.customSelectedMembers.filter(m => m.id !== memberId);
  }

  clearCustomList(): void {
    this.activeGroup = null;
    this.showSaveGroup = false;
    this.confirmDeleteGroup = false;
    this.customSelectedMembers = [];
    this.customSearchQuery = '';
    this.customSearchResults = [];
  }

  onCustomSearchBlur(): void {
    setTimeout(() => { this.showCustomDropdown = false; }, 200);
  }

  get customListCount(): number {
    return this.customSelectedMembers.length;
  }

  // ── Saved recipient groups ─────────────────────────────────────────────────

  /** Adds members to the custom list, skipping anyone already in it. */
  private mergeIntoCustomList(members: Member[]): number {
    const have = new Set(this.customSelectedMembers.map((m) => m.id));
    const fresh = members.filter((m) => !have.has(m.id));
    this.customSelectedMembers = [...this.customSelectedMembers, ...fresh];
    return fresh.length;
  }

  private setGroupFeedback(message: string, error = ''): void {
    this.groupMessage = message;
    this.groupError = error;
    if (message) setTimeout(() => (this.groupMessage = ''), 5000);
  }

  async loadSavedGroups(): Promise<void> {
    this.loadingGroups = true;
    try {
      this.savedGroups = await this.recipientGroups.listGroups();
    } catch {
      // Table may not exist yet (migration not run) - fail quietly, list stays empty
      this.savedGroups = [];
    } finally {
      this.loadingGroups = false;
    }
  }

  async onLoadGroup(groupId: string): Promise<void> {
    if (!groupId) return;
    const group = this.savedGroups.find((g) => g.id === groupId);
    if (!group) return;
    this.groupError = '';
    try {
      const { members, skipped } = await this.recipientGroups.getGroupMembers(groupId);
      const hadMembers = this.customSelectedMembers.length > 0;
      const added = this.mergeIntoCustomList(members);
      this.activeGroup = hadMembers ? this.activeGroup : group;
      let msg = `Added ${added} member${added === 1 ? '' : 's'} from "${group.name}".`;
      if (skipped > 0) msg += ` ${skipped} skipped (deceased/transferred).`;
      this.setGroupFeedback(msg);
    } catch (e: any) {
      this.setGroupFeedback('', e?.message || 'Could not load that group.');
    }
  }

  openSaveGroup(): void {
    this.saveGroupName = this.activeGroup?.name || '';
    this.groupError = '';
    this.confirmDeleteGroup = false;
    this.showSaveGroup = true;
  }

  async confirmSaveGroup(updateExisting: boolean): Promise<void> {
    if (this.savingGroup) return;
    const name = this.saveGroupName.trim();
    if (name.length < 2) {
      this.groupError = 'Please enter a group name (at least 2 characters).';
      return;
    }
    if (this.customSelectedMembers.length === 0) {
      this.groupError = 'Add at least one member before saving a group.';
      return;
    }
    this.savingGroup = true;
    this.groupError = '';
    try {
      const id = await this.recipientGroups.saveGroup(
        updateExisting && this.activeGroup ? this.activeGroup.id : null,
        name,
        this.customSelectedMembers.map((m) => m.id),
      );
      await this.loadSavedGroups();
      this.activeGroup = this.savedGroups.find((g) => g.id === id) || null;
      this.showSaveGroup = false;
      this.setGroupFeedback(`Group "${name}" saved with ${this.customSelectedMembers.length} members.`);
    } catch (e: any) {
      this.groupError = e?.message || 'Could not save the group.';
    } finally {
      this.savingGroup = false;
    }
  }

  async deleteActiveGroup(): Promise<void> {
    if (!this.activeGroup || this.savingGroup) return;
    this.savingGroup = true;
    try {
      const name = this.activeGroup.name;
      await this.recipientGroups.deleteGroup(this.activeGroup.id);
      this.activeGroup = null;
      this.confirmDeleteGroup = false;
      this.showSaveGroup = false;
      await this.loadSavedGroups();
      this.setGroupFeedback(`Group "${name}" deleted. Members themselves were not affected.`);
    } catch (e: any) {
      this.groupError = e?.message || 'Could not delete the group.';
    } finally {
      this.savingGroup = false;
    }
  }

  // ── Import from cell / ministry / branch ───────────────────────────────────

  get importTypeLabel(): string {
    return this.importType === 'cell' ? 'cell group' : this.importType === 'branch' ? 'branch' : 'ministry';
  }

  onImportTypeChange(type: string): void {
    this.importType = type as ImportSourceType;
    this.importTargetId = '';
    this.loadImportTargets();
  }

  private async loadImportTargets(): Promise<void> {
    this.loadingImportTargets = true;
    this.importTargets = [];
    try {
      this.importTargets = await this.bulkMembership.getTargets(this.importType);
    } catch {
      this.importTargets = [];
    } finally {
      this.loadingImportTargets = false;
    }
  }

  async addFromTarget(): Promise<void> {
    if (!this.importTargetId || this.importing) return;
    this.importing = true;
    this.groupError = '';
    try {
      const target = this.importTargets.find((t) => t.id === this.importTargetId);
      const { members, skipped } = await this.recipientGroups.getMembersOfTarget(
        this.importType,
        this.importTargetId,
      );
      const added = this.mergeIntoCustomList(members);
      let msg = `Added ${added} member${added === 1 ? '' : 's'} from ${target?.name || 'the ' + this.importTypeLabel}.`;
      if (members.length === 0) msg = `No members found in ${target?.name || 'that ' + this.importTypeLabel}.`;
      if (skipped > 0) msg += ` ${skipped} skipped (deceased/transferred).`;
      this.setGroupFeedback(msg);
    } catch (e: any) {
      this.setGroupFeedback('', e?.message || 'Could not load members.');
    } finally {
      this.importing = false;
    }
  }

  // ── Computed helpers ───────────────────────────────────────────────────────

  get isSingleMemberTarget(): boolean {
    return this.communicationForm.get('target_audience')?.value === 'member';
  }

  get isCustomTarget(): boolean {
    return this.communicationForm.get('target_audience')?.value === 'custom';
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const sendRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'ministry_leader'];
    this.canManageCommunications =
      this.permissionService.isAdmin ||
      this.permissionService.communications.send ||
      this.permissionService.communications.bulk ||
      sendRoles.includes(role);
    if (!this.canManageCommunications) this.router.navigate(['/unauthorized']);
  }

  private initForm(): void {
    this.communicationForm = this.fb.group({
      title:              ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      message:            ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
      communication_type: ['sms' as CommunicationType, [Validators.required]],
      target_audience:    ['all' as TargetAudience, [Validators.required]],
      scheduled_at:       [''],
    });

    // Clear member/custom state when audience changes
    this.communicationForm.get('target_audience')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        if (val !== 'member') this.clearSelectedMember();
        if (val !== 'custom') this.clearCustomList();
      });
  }

  applyTemplate(template: MessageTemplate): void {
    this.communicationForm.patchValue({ title: template.name, message: template.message });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

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

    if (this.isCustomTarget && this.customSelectedMembers.length === 0) {
      this.errorMessage = 'Please add at least one member to your custom list';
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
      title:              this.communicationForm.value.title.trim(),
      message:            this.communicationForm.value.message.trim(),
      communication_type: this.communicationForm.value.communication_type,
      target_audience:    this.communicationForm.value.target_audience,
      scheduled_at:       this.communicationForm.value.scheduled_at || undefined,
      target_member_id:   this.selectedMember?.id || null,
      // Pass custom member IDs array for custom list sends
      custom_member_ids:  this.isCustomTarget
        ? this.customSelectedMembers.map(m => m.id)
        : null,
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

  private triggerSendWithProgress(communicationId: string, type: CommunicationType): void {
    this.sending = true;
    this.sendProgress = { total: 0, sent: 0, failed: 0, percent: 0, done: false };

    this.communicationsService
      .sendCommunication(communicationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.startPolling(communicationId, type); },
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
              this.successMessage = `Message sent to ${progress.sent} recipient${progress.sent > 1 ? 's' : ''}!`;
            } else if (progress.failed > 0 && progress.sent > 0) {
              this.successMessage = `Sent to ${progress.sent}. ${progress.failed} failed.`;
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
    if (this.communicationForm.dirty || this.customSelectedMembers.length > 0) {
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
    if (control.hasError('minlength'))
      return `Minimum ${control.getError('minlength').requiredLength} characters required`;
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters allowed`;
    return 'Invalid input';
  }

  getCharacterCount(): number {
    return this.communicationForm.get('message')?.value?.length || 0;
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


