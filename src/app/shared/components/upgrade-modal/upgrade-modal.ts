// src/app/shared/components/upgrade-modal/upgrade-modal.component.ts
// CHANGES vs original:
// 1. selectPlan() now opens Paystack checkout instead of WhatsApp
// 2. Billing email input added
// 3. Fee breakdown shown (same formula as PaymentForm)
// 4. Loading/error state during initialization
// 5. SubscriptionPaystackService injected

import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionService, SubscriptionPlan } from '../../../core/services/subscription.service';
import { SubscriptionPaystackService } from '../../../core/services/subscription-paystack.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-upgrade-modal',
  standalone: false,
  templateUrl: './upgrade-modal.html',
  styleUrl: './upgrade-modal.scss',
})
export class UpgradeModal implements OnInit {
  @Input() show = false;
  @Input() trigger = '';
  @Output() closed = new EventEmitter<void>();

  plans: SubscriptionPlan[] = [];
  billingCycle: 'monthly' | 'yearly' = 'monthly';

  // ── Checkout state ─────────────────────────────────────────────────────────
  selectedPlan: SubscriptionPlan | null = null;
  billingEmail = '';
  checkoutStep: 'plans' | 'checkout' = 'plans';
  processing = false;
  errorMessage = '';

  constructor(
    private subscriptionService: SubscriptionService,
    private subscriptionPaystack: SubscriptionPaystackService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Pre-fill billing email from current user profile
    const profile = this.authService.currentProfile;
    if (profile?.church_id) {
      this.billingEmail = profile.email || this.authService.getUserEmail() || '';
    }

    this.subscriptionService.getPlans().subscribe({
      next: (plans) => {
        this.plans = plans.filter(p => p.id !== 'free');
      },
    });

    // Ensure fee settings are loaded
    if (!this.subscriptionPaystack.feeSettingsLoaded) {
      this.subscriptionPaystack.loadFeeSettings();
    }
  }

  // ── Computed helpers ────────────────────────────────────────────────────────

  getPrice(plan: SubscriptionPlan): number {
    return this.billingCycle === 'yearly'
      ? plan.price_yearly / 12
      : plan.price_monthly;
  }

  getYearlySaving(plan: SubscriptionPlan): number {
    return (plan.price_monthly * 12) - plan.price_yearly;
  }

  getDurationMonths(): number {
    return this.billingCycle === 'yearly' ? 12 : 1;
  }

  getTotalPrice(): number {
    if (!this.selectedPlan) return 0;
    return this.billingCycle === 'yearly'
      ? this.selectedPlan.price_yearly
      : this.selectedPlan.price_monthly;
  }

  getChargeAmount(): number {
    return this.subscriptionPaystack.calculateChargeAmount(this.getTotalPrice());
  }

  getFeeAmount(): number {
    return this.subscriptionPaystack.calculateFeeAmount(this.getTotalPrice());
  }

  get totalFeePercent(): number {
    return this.subscriptionPaystack.totalFeePercent;
  }

  get passFeesToPayer(): boolean {
    return this.subscriptionPaystack.passFeesToPayer;
  }

  formatLimit(value: number | null): string {
    return value === null ? 'Unlimited' : value.toString();
  }

  get currentTier(): string {
    return this.subscriptionService.currentTier;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  selectPlanForCheckout(plan: SubscriptionPlan): void {
    this.selectedPlan = plan;
    this.checkoutStep = 'checkout';
    this.errorMessage = '';
  }

  backToPlans(): void {
    this.checkoutStep = 'plans';
    this.selectedPlan = null;
    this.errorMessage = '';
  }

  close(): void {
    // Don't close while processing payment
    if (this.processing) return;
    this.checkoutStep = 'plans';
    this.selectedPlan = null;
    this.errorMessage = '';
    this.closed.emit();
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  async proceedToPayment(): Promise<void> {
    if (!this.selectedPlan) return;

    if (!this.billingEmail || !this.billingEmail.includes('@')) {
      this.errorMessage = 'Please enter a valid billing email address';
      return;
    }

    const churchId = this.authService.getChurchId();
    if (!churchId) {
      this.errorMessage = 'Church not found. Please sign in again.';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    try {
      const result = await this.subscriptionPaystack.initializePayment({
        planId: this.selectedPlan.id,
        planName: this.selectedPlan.name,
        durationMonths: this.getDurationMonths(),
        planPrice: this.getTotalPrice(),
        billingEmail: this.billingEmail,
        churchId,
      });

      // Store reference so the callback page can poll it
      sessionStorage.setItem('subscription_pending_ref', result.reference);
      sessionStorage.setItem('subscription_plan_name', this.selectedPlan.name);

      // Redirect to Paystack hosted checkout
      window.location.href = result.authorization_url;

    } catch (err: any) {
      this.processing = false;
      this.errorMessage = err.message || 'Payment initialization failed. Please try again.';
    }
  }
}
