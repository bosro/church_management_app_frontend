// src/app/features/admin/churches/churches.ts
// CHANGES vs original:
// 1. churchForm has sms_sender_id field added
// 2. openEditModal() populates sms_sender_id from church record
// 3. defaultSenderId loaded from platform_settings for the hint text
// Everything else is identical to your original.

import { Component, OnInit } from '@angular/core';
import { Church } from '../../../models/church.model';
import { AdminService } from '../services/admin.service';
import {
  SubscriptionService,
  SubscriptionPlan,
} from '../../../core/services/subscription.service';
import { SmsSettingsService } from '../../../core/services/sms-settings.service';

@Component({
  selector: 'app-churches',
  standalone: false,
  templateUrl: './churches.html',
  styleUrl: './churches.scss',
})
export class Churches implements OnInit {
  churches: any[] = [];
  filteredChurches: any[] = [];
  loading = false;
  searchTerm = '';

  showCreateModal = false;
  showEditModal = false;
  selectedChurch: Church | null = null;

  // ── CHANGED: added sms_sender_id ─────────────────────────────
  churchForm = {
    name: '',
    location: '',
    size_category: '',
    contact_email: '',
    contact_phone: '',
    enabled_features: [] as string[],
    sms_sender_id: '', // ← NEW
  };

  // Platform default sender ID — shown as placeholder hint in edit modal
  defaultSenderId = 'CHURCHMAN';

  // Subscription modal
  showSubscriptionModal = false;
  selectedChurchForSub: any = null;
  churchUsage: any = null;
  loadingUsage = false;
  availablePlans: SubscriptionPlan[] = [];

  subscriptionForm = {
    plan_id: 'free',
    duration_months: 1,
    payment_reference: '',
    billing_email: '',
    complimentary: false,
  };

  // ── Church detail (summary + members) ─────────────────────────
  showDetailModal = false;
  detailChurchRow: any = null;
  detailTab: 'overview' | 'members' = 'overview';
  detail: any = null;
  detailLoading = false;
  detailError = '';

  members: any[] = [];
  membersTotal = 0;
  membersFiltered = 0;
  memberSearch = '';
  memberPage = 0;
  memberBranchFilter = '';   // '' = all branches
  readonly memberPageSize = 25;
  membersLoading = false;
  private memberSearchTimer: any;

  durationOptions = [
    { value: 1, label: '1 Month' },
    { value: 3, label: '3 Months' },
    { value: 6, label: '6 Months' },
    { value: 12, label: '12 Months (1 Year)' },
  ];

  errorMessage = '';
  successMessage = '';
  processing = false;

  constructor(
    private adminService: AdminService,
    private subscriptionService: SubscriptionService,
    private smsSettingsService: SmsSettingsService, // ← NEW
  ) {}

  ngOnInit(): void {
    this.loadChurches();
    this.loadPlans();
    this.loadDefaultSenderId(); // ← NEW
  }

  // ── NEW: load default sender ID for hint text ─────────────────
  loadDefaultSenderId(): void {
    this.smsSettingsService.getSettings().subscribe({
      next: (s) => {
        this.defaultSenderId = s.defaultSenderId;
      },
      error: () => {},
    });
  }

  loadChurches(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getAllChurchesWithSubscription().subscribe({
      next: (data) => {
        this.churches = data;
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to load churches';
        this.loading = false;
      },
    });
  }

  loadPlans(): void {
    this.subscriptionService.getPlans().subscribe({
      next: (plans) => {
        this.availablePlans = plans;
      },
      error: (err) => console.error('Failed to load plans:', err),
    });
  }

  applyFilters(): void {
    this.filteredChurches = this.churches.filter(
      (church) =>
        !this.searchTerm ||
        church.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        church.location?.toLowerCase().includes(this.searchTerm.toLowerCase()),
    );
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  // ── Subscription Modal (unchanged) ────────────────────────────
  openSubscriptionModal(church: any): void {
    this.selectedChurchForSub = church;
    this.subscriptionForm = {
      plan_id: church.subscription_plan || 'free',
      duration_months: 1,
      payment_reference: church.payment_reference || '',
      billing_email: church.billing_email || church.contact_email || '',
      complimentary: !!church.is_complimentary,
    };
    this.churchUsage = null;
    this.showSubscriptionModal = true;
    this.errorMessage = '';
    this.loadChurchUsage(church.id);
  }

  closeSubscriptionModal(): void {
    this.showSubscriptionModal = false;
    this.selectedChurchForSub = null;
    this.churchUsage = null;
  }

  loadChurchUsage(churchId: string): void {
    this.loadingUsage = true;
    this.adminService.getChurchUsage(churchId).subscribe({
      next: (usage) => {
        this.churchUsage = usage;
        this.loadingUsage = false;
      },
      error: () => {
        this.loadingUsage = false;
      },
    });
  }

  saveSubscription(): void {
    if (!this.selectedChurchForSub) return;

    this.processing = true;
    this.errorMessage = '';

    this.adminService
      .updateChurchSubscription(
        this.selectedChurchForSub.id,
        this.subscriptionForm.plan_id,
        this.subscriptionForm.duration_months,
        this.subscriptionForm.payment_reference,
        this.subscriptionForm.billing_email,
        this.subscriptionForm.complimentary,
      )
      .subscribe({
        next: () => {
          this.successMessage = `Subscription updated to ${this.getPlanName(this.subscriptionForm.plan_id)} for ${this.selectedChurchForSub.name}!`;
          this.processing = false;
          this.closeSubscriptionModal();
          this.loadChurches();
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update subscription';
          this.processing = false;
        },
      });
  }

  // ── Church detail modal ───────────────────────────────────────
  openDetails(church: any): void {
    this.detailChurchRow = church;
    this.detailTab = 'overview';
    this.detail = null;
    this.detailError = '';
    this.members = [];
    this.membersTotal = 0;
    this.membersFiltered = 0;
    this.memberSearch = '';
    this.memberPage = 0;
    this.memberBranchFilter = '';
    this.showDetailModal = true;
    this.detailLoading = true;

    this.adminService.getChurchSummary(church.id).subscribe({
      next: (d) => {
        this.detail = d;
        this.membersTotal = d?.members_total ?? 0;
        this.detailLoading = false;
      },
      error: (e) => {
        this.detailError = e.message || 'Failed to load church details';
        this.detailLoading = false;
      },
    });
  }

  closeDetails(): void {
    this.showDetailModal = false;
    this.detailChurchRow = null;
    this.detail = null;
  }

  switchDetailTab(tab: 'overview' | 'members'): void {
    this.detailTab = tab;
    if (tab === 'members' && this.members.length === 0 && !this.membersLoading) this.loadMembers();
  }

  loadMembers(): void {
    if (!this.detailChurchRow) return;
    this.membersLoading = true;
    this.adminService
      .getChurchMembers(this.detailChurchRow.id, this.memberSearch, this.memberPageSize, this.memberPage * this.memberPageSize, this.memberBranchFilter || null)
      .subscribe({
        next: (r) => {
          this.members = r?.members || [];
          this.membersTotal = r?.total ?? 0;
          this.membersFiltered = r?.filtered ?? 0;
          this.membersLoading = false;
        },
        error: (e) => {
          this.detailError = e.message || 'Failed to load members';
          this.membersLoading = false;
        },
      });
  }

  onMemberSearch(): void {
    clearTimeout(this.memberSearchTimer);
    this.memberSearchTimer = setTimeout(() => {
      this.memberPage = 0;
      this.loadMembers();
    }, 350);
  }

  /** Jump from a branch row to that branch's members */
  viewBranchMembers(branchId: string): void {
    this.memberBranchFilter = branchId;
    this.memberSearch = '';
    this.memberPage = 0;
    this.detailTab = 'members';
    this.loadMembers();
  }

  onBranchFilterChange(): void {
    this.memberPage = 0;
    this.loadMembers();
  }

  get memberPageCount(): number {
    return Math.max(1, Math.ceil(this.membersFiltered / this.memberPageSize));
  }

  changeMemberPage(delta: number): void {
    const next = this.memberPage + delta;
    if (next < 0 || next >= this.memberPageCount) return;
    this.memberPage = next;
    this.loadMembers();
  }

  /** Export the members matching the current search as CSV (super admin) */
  exportMembersCsv(): void {
    if (!this.detailChurchRow) return;
    this.adminService.getChurchMembers(this.detailChurchRow.id, this.memberSearch, 500, 0, this.memberBranchFilter || null).subscribe({
      next: (r) => {
        const rows: any[] = r?.members || [];
        const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Member No', 'First name', 'Last name', 'Email', 'Phone', 'Branch', 'Status', 'Joined'];
        const lines = rows.map((m) =>
          [m.member_number, m.first_name, m.last_name, m.email, m.phone_primary, m.branch_name, m.membership_status, m.join_date].map(esc).join(','),
        );
        const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(this.detailChurchRow.name || 'church').replace(/[^a-z0-9]+/gi, '-')}-members.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: (e) => (this.detailError = e.message || 'Export failed'),
    });
  }

  // ── Create Modal ──────────────────────────────────────────────
  openCreateModal(): void {
    this.churchForm = {
      name: '',
      location: '',
      size_category: '',
      contact_email: '',
      contact_phone: '',
      enabled_features: [] as string[],
      sms_sender_id: '', // ← NEW
    };
    this.showCreateModal = true;
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  // ── Edit Modal — CHANGED: populates sms_sender_id ─────────────
  openEditModal(church: any): void {
    this.selectedChurch = church;
    this.churchForm = {
      name: church.name,
      location: church.location || '',
      size_category: church.size_category || '',
      contact_email: church.contact_email || '',
      contact_phone: church.contact_phone || '',
      enabled_features: church.enabled_features || [],
      sms_sender_id: church.sms_sender_id || '', // ← NEW
    };
    this.showEditModal = true;
    this.errorMessage = '';
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedChurch = null;
  }

  createChurch(): void {
    this.processing = true;
    this.errorMessage = '';
    this.adminService
      .createChurch({ ...this.churchForm, is_active: true })
      .subscribe({
        next: () => {
          this.successMessage = 'Church created successfully!';
          this.processing = false;
          this.closeCreateModal();
          this.loadChurches();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create church';
          this.processing = false;
        },
      });
  }

  // ── updateChurch — CHANGED: sms_sender_id included automatically
  // because churchForm already has it and we spread the whole form.
  // No other changes needed here.
  updateChurch(): void {
    if (!this.selectedChurch) return;
    this.processing = true;
    this.errorMessage = '';

    // Enforce 11-char max client-side before saving
    const formData = {
      ...this.churchForm,
      sms_sender_id:
        this.churchForm.sms_sender_id?.trim().substring(0, 11) || null,
    };

    this.adminService.updateChurch(this.selectedChurch.id, formData).subscribe({
      next: () => {
        this.successMessage = 'Church updated successfully!';
        this.processing = false;
        this.closeEditModal();
        this.loadChurches();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to update church';
        this.processing = false;
      },
    });
  }

  reactivateChurch(church: Church): void {
    if (!confirm(`Reactivate ${church.name}? Its users will be able to sign in again and everything will be as it was.`)) return;
    this.adminService.reactivateChurch(church.id).subscribe({
      next: () => {
        this.successMessage = `${church.name} reactivated.`;
        this.loadChurches();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to reactivate church';
        setTimeout(() => (this.errorMessage = ''), 4000);
      },
    });
  }

  // ── Suspend with a reason ─────────────────────────────────────
  suspendTarget: Church | null = null;
  suspendReason = '';
  suspending = false;

  openSuspend(church: Church): void {
    this.suspendTarget = church;
    this.suspendReason = '';
    this.errorMessage = '';
  }

  closeSuspend(): void {
    if (!this.suspending) this.suspendTarget = null;
  }

  get suspendValid(): boolean {
    const n = this.suspendReason.trim().length;
    return n >= 3 && n <= 300;
  }

  confirmSuspend(): void {
    if (!this.suspendTarget || !this.suspendValid || this.suspending) return;
    this.suspending = true;
    const church = this.suspendTarget;
    this.adminService.suspendChurch(church.id, this.suspendReason.trim()).subscribe({
      next: () => {
        this.suspending = false;
        this.suspendTarget = null;
        this.successMessage = `${church.name} suspended. Its users are signed out and will see your reason.`;
        this.loadChurches();
        setTimeout(() => (this.successMessage = ''), 5000);
      },
      error: (error) => {
        this.suspending = false;
        this.errorMessage = error.message || 'Failed to suspend church';
        setTimeout(() => (this.errorMessage = ''), 5000);
      },
    });
  }

  // ── Helpers (unchanged) ───────────────────────────────────────
  getPlanName(planId: string): string {
    const plan = this.availablePlans.find((p) => p.id === planId);
    return plan?.name || planId;
  }

  getPlanBadgeClass(plan: string): string {
    switch (plan) {
      case 'pro':
        return 'badge-pro';
      case 'growth':
        return 'badge-growth';
      case 'starter':
        return 'badge-starter';
      default:
        return 'badge-free';
    }
  }

  isExpired(church: any): boolean {
    if (church.is_complimentary) return false;
    if (!church.subscription_expires_at) return false;
    return new Date(church.subscription_expires_at) < new Date();
  }

  getExpiryLabel(church: any): string {
    if (church.is_complimentary) return 'Complimentary';
    if (!church.subscription_expires_at) return 'No expiry';
    if (this.isExpired(church)) return 'Expired';
    const days = Math.ceil(
      (new Date(church.subscription_expires_at).getTime() -
        new Date().getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return days <= 30 ? `Expires in ${days}d` : 'Active';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  toggleFeature(feature: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.churchForm.enabled_features = [
        ...this.churchForm.enabled_features,
        feature,
      ];
    } else {
      this.churchForm.enabled_features =
        this.churchForm.enabled_features.filter((f) => f !== feature);
    }
  }

  // Sender ID character count helper for template
  get senderIdCharCount(): number {
    return this.churchForm.sms_sender_id?.length || 0;
  }
}
