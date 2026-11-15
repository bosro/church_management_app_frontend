
// src/app/features/admin/plans/plans.ts
import { Component, OnInit } from '@angular/core';
import { SubscriptionService, SubscriptionPlan } from '../../../core/services/subscription.service';
import { SupabaseService } from '../../../core/services/supabase';
import { from } from 'rxjs';
import { PlanPdfService } from '../../../core/services/plan-pdf.service';
import { UsdRateService } from '../../../core/services/usd-rate-service';

@Component({
  selector: 'app-plans',
  standalone: false,
  templateUrl: './plans.html',
  styleUrl: './plans.scss',
})
export class Plans implements OnInit {
  plans: SubscriptionPlan[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';
  processing = false;

  showCreateModal = false;
  showEditModal = false;
  selectedPlan: SubscriptionPlan | null = null;

  refreshingRate = false;

  manualRate: number | null = null;
  savingRate = false;

  planForm = {
    id: '',
    name: '',
    price_monthly: 0,
    price_yearly: 0,
    currency: 'GHS',
    max_members: null as number | null,
    max_branches: null as number | null,
    max_users: null as number | null,
    max_forms: null as number | null,
    max_events: null as number | null,
    max_ministries: null as number | null,
    can_export: false,
    can_send_communications: false,
    can_use_reports: false,
    can_custom_branding: false,
    // new fields (01_subscription_migration.sql)
    sms_monthly_limit: null as number | null,
    can_remove_ads: false,
    support_level: '' as string | null,
    tagline: '' as string | null,
    sort_order: 0,
    price_monthly_usd: null as number | null,
    price_yearly_usd: null as number | null,
  };

  constructor(
    private subscriptionService: SubscriptionService,
    private supabase: SupabaseService,
    private planPdf: PlanPdfService,
    public usd: UsdRateService,
  ) { }




  async saveManualRate(): Promise<void> {
    if (!this.manualRate || this.manualRate <= 0) { this.errorMessage = 'Enter a rate, e.g. 12'; return; }
    this.savingRate = true; this.errorMessage = '';
    try {
      await this.usd.setManualRate(Number(this.manualRate));
      this.successMessage = `Your rate is on: $1 = GH₵${this.usd.rate}. Plans repriced.`;
      this.manualRate = null;
      this.loadPlans();
    } catch (e: any) { this.errorMessage = e?.message || 'Could not save the rate'; }
    this.savingRate = false;
    setTimeout(() => (this.successMessage = ''), 4000);
  }

  async switchToLiveRate(): Promise<void> {
    this.savingRate = true; this.errorMessage = '';
    try {
      await this.usd.useLiveRate();
      this.successMessage = `Live rate is back on: $1 = GH₵${this.usd.rate}`;
      this.loadPlans();
    } catch (e: any) { this.errorMessage = e?.message || 'Could not switch'; }
    this.savingRate = false;
    setTimeout(() => (this.successMessage = ''), 4000);
  }

  // ── PDF export ────────────────────────────────────────────
  exportPlanPdf(plan: SubscriptionPlan): void {
    this.planPdf.exportPlan(plan);
  }

  exportAllPlansPdf(): void {
    this.planPdf.exportComparison(this.plans);
  }

  /** "GHS 50/mo billed GHS 600 yearly" helper for the plan cards */
  yearlyPerMonth(plan: SubscriptionPlan): number {
    return plan.price_yearly / 12;
  }
  yearlySavingPercent(plan: SubscriptionPlan): number {
    const full = plan.price_monthly * 12;
    return full > 0 ? Math.round(((full - plan.price_yearly) / full) * 100) : 0;
  }

  smsLabel(plan: SubscriptionPlan): string {
    if (!plan.can_send_communications) return 'No SMS';
    return plan.sms_monthly_limit === null || plan.sms_monthly_limit === undefined
      ? 'Unlimited SMS'
      : `${plan.sms_monthly_limit} SMS / month`;
  }

  ngOnInit(): void {
    this.loadPlans();
    this.refreshRate(false);
  }

  loadPlans(): void {
    this.loading = true;
    this.subscriptionService.getPlans().subscribe({
      next: (plans) => { this.plans = plans; this.loading = false; },
      error: (err) => { this.errorMessage = err.message; this.loading = false; },
    });
  }

  openCreateModal(): void {
    this.planForm = {
      id: '', name: '', price_monthly: 0, price_yearly: 0, currency: 'GHS',
      max_members: 100, max_branches: 1, max_users: 5,
      max_forms: 5, max_events: 10, max_ministries: 3,
      can_export: false, can_send_communications: false,
      can_use_reports: false, can_custom_branding: false,
      sms_monthly_limit: 0, can_remove_ads: false, support_level: 'Community',
      tagline: '', sort_order: this.plans.length,
      price_monthly_usd: null as number | null,
      price_yearly_usd: null as number | null,
    };
    this.showCreateModal = true;
    this.errorMessage = '';
  }

  openEditModal(plan: SubscriptionPlan): void {
    this.selectedPlan = plan;
    this.planForm = { ...plan } as any;
    this.showEditModal = true;
    this.errorMessage = '';
  }

  closeModals(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedPlan = null;
  }

  createPlan(): void {
    if (!this.planForm.id || !this.planForm.name) {
      this.errorMessage = 'Plan ID and Name are required';
      return;
    }
    this.processing = true;
    from(
      this.supabase.client
        .from('subscription_plans')
        .insert({ ...this.planForm, is_active: true })
    ).subscribe({
      next: ({ error }) => {
        if (error) { this.errorMessage = error.message; this.processing = false; return; }
        this.successMessage = 'Plan created!';
        this.processing = false;
        this.closeModals();
        this.loadPlans();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => { this.errorMessage = err.message; this.processing = false; },
    });
  }

  updatePlan(): void {
    if (!this.selectedPlan) return;
    this.processing = true;
    from(
      this.supabase.client
        .from('subscription_plans')
        .update({ ...this.planForm })
        .eq('id', this.selectedPlan.id)
    ).subscribe({
      next: ({ error }) => {
        if (error) { this.errorMessage = error.message; this.processing = false; return; }
        this.successMessage = 'Plan updated!';
        this.processing = false;
        this.closeModals();
        this.loadPlans();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => { this.errorMessage = err.message; this.processing = false; },
    });
  }

  deletePlan(plan: SubscriptionPlan): void {
    if (!confirm(`Delete plan "${plan.name}"? Churches on this plan will be moved to free.`)) return;
    from(
      this.supabase.client
        .from('subscription_plans')
        .update({ is_active: false })
        .eq('id', plan.id)
    ).subscribe({
      next: ({ error }) => {
        if (error) { this.errorMessage = error.message; return; }
        this.successMessage = 'Plan deactivated!';
        this.loadPlans();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
    });
  }

  formatCurrency(amount: number): string {
    return `GHS ${amount.toFixed(2)}`;
  }

  getLimitLabel(val: number | null): string {
    return val === null ? 'Unlimited' : val.toString();
  }


  async refreshRate(force = true): Promise<void> {
    this.refreshingRate = true;
    await this.usd.ensureFresh(force);
    this.refreshingRate = false;
    this.loadPlans();            // cedi prices were recalculated on the server
    if (force) { this.successMessage = `Rate updated: $1 = GH₵${this.usd.rate}`; setTimeout(() => (this.successMessage = ''), 3000); }
  }

  formatUsd(amount: number | null | undefined): string {
    return '$' + (Number(amount) || 0).toFixed(2).replace(/\.00$/, '');
  }
}




