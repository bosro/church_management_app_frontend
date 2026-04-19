
// src/app/features/admin/plans/plans.ts
import { Component, OnInit } from '@angular/core';
import { SubscriptionService, SubscriptionPlan } from '../../../core/services/subscription.service';
import { SupabaseService } from '../../../core/services/supabase';
import { from } from 'rxjs';

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
  };

  constructor(
    private subscriptionService: SubscriptionService,
    private supabase: SupabaseService,
  ) {}

  ngOnInit(): void {
    this.loadPlans();
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
}


