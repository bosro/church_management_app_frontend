// src/app/features/admin/churches/churches.ts
import { Component, OnInit } from '@angular/core';
import { Church } from '../../../models/church.model';
import { AdminService } from '../services/admin.service';
import { SubscriptionService, SubscriptionPlan } from '../../../core/services/subscription.service';

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

  // Existing modals
  showCreateModal = false;
  showEditModal = false;
  selectedChurch: Church | null = null;

  churchForm = {
    name: '',
    location: '',
    size_category: '',
    contact_email: '',
    contact_phone: '',
    enabled_features: [] as string[],
  };

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
  };

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
  ) {}

  ngOnInit(): void {
    this.loadChurches();
    this.loadPlans();
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
      next: (plans) => { this.availablePlans = plans; },
      error: (err) => console.error('Failed to load plans:', err),
    });
  }

  applyFilters(): void {
    this.filteredChurches = this.churches.filter((church) => {
      return !this.searchTerm ||
        church.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        church.location?.toLowerCase().includes(this.searchTerm.toLowerCase());
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  // ── Subscription Modal ──────────────────────────────────────
  openSubscriptionModal(church: any): void {
    this.selectedChurchForSub = church;
    this.subscriptionForm = {
      plan_id: church.subscription_plan || 'free',
      duration_months: 1,
      payment_reference: church.payment_reference || '',
      billing_email: church.billing_email || church.contact_email || '',
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
      error: () => { this.loadingUsage = false; },
    });
  }

  saveSubscription(): void {
    if (!this.selectedChurchForSub) return;

    this.processing = true;
    this.errorMessage = '';

    this.adminService.updateChurchSubscription(
      this.selectedChurchForSub.id,
      this.subscriptionForm.plan_id,
      this.subscriptionForm.duration_months,
      this.subscriptionForm.payment_reference,
      this.subscriptionForm.billing_email,
    ).subscribe({
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

  // ── Existing Methods ─────────────────────────────────────────
  openCreateModal(): void {
    this.churchForm = {
      name: '', location: '', size_category: '',
      contact_email: '', contact_phone: '',
      enabled_features: [] as string[],
    };
    this.showCreateModal = true;
    this.errorMessage = '';
  }

  closeCreateModal(): void { this.showCreateModal = false; }

  openEditModal(church: Church): void {
    this.selectedChurch = church;
    this.churchForm = {
      name: church.name,
      location: church.location || '',
      size_category: church.size_category || '',
      contact_email: church.contact_email || '',
      contact_phone: church.contact_phone || '',
      enabled_features: church.enabled_features || [],
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
    this.adminService.createChurch({ ...this.churchForm, is_active: true }).subscribe({
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

  updateChurch(): void {
    if (!this.selectedChurch) return;
    this.processing = true;
    this.errorMessage = '';
    this.adminService.updateChurch(this.selectedChurch.id, this.churchForm).subscribe({
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

  deactivateChurch(church: Church): void {
    if (!confirm(`Are you sure you want to deactivate ${church.name}?`)) return;
    this.adminService.deleteChurch(church.id).subscribe({
      next: () => {
        this.successMessage = 'Church deactivated successfully!';
        this.loadChurches();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (error) => {
        this.errorMessage = error.message || 'Failed to deactivate church';
        setTimeout(() => (this.errorMessage = ''), 3000);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  getPlanName(planId: string): string {
    const plan = this.availablePlans.find(p => p.id === planId);
    return plan?.name || planId;
  }

  getPlanBadgeClass(plan: string): string {
    switch (plan) {
      case 'pro': return 'badge-pro';
      case 'growth': return 'badge-growth';
      default: return 'badge-free';
    }
  }

  isExpired(church: any): boolean {
    if (!church.subscription_expires_at) return false;
    return new Date(church.subscription_expires_at) < new Date();
  }

  getExpiryLabel(church: any): string {
    if (!church.subscription_expires_at) return 'No expiry';
    if (this.isExpired(church)) return 'Expired';
    const days = Math.ceil(
      (new Date(church.subscription_expires_at).getTime() - new Date().getTime())
      / (1000 * 60 * 60 * 24)
    );
    return days <= 30 ? `Expires in ${days}d` : 'Active';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  toggleFeature(feature: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.churchForm.enabled_features = [...this.churchForm.enabled_features, feature];
    } else {
      this.churchForm.enabled_features = this.churchForm.enabled_features.filter(f => f !== feature);
    }
  }
}
