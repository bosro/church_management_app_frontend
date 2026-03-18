
// src/app/shared/components/upgrade-modal/upgrade-modal.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SubscriptionService, SubscriptionPlan } from '../../../core/services/subscription.service';

@Component({
  selector: 'app-upgrade-modal',
  standalone: false,
  templateUrl: './upgrade-modal.html',
  styleUrl: './upgrade-modal.scss',
})
export class UpgradeModal implements OnInit {
  @Input() show = false;
  @Input() trigger = ''; // What triggered the upgrade prompt
  @Output() closed = new EventEmitter<void>();

  plans: SubscriptionPlan[] = [];
  billingCycle: 'monthly' | 'yearly' = 'monthly';
  loading = false;

  constructor(private subscriptionService: SubscriptionService) {}

  ngOnInit(): void {
    this.subscriptionService.getPlans().subscribe({
      next: (plans) => {
        // Exclude free plan from upgrade options
        this.plans = plans.filter(p => p.id !== 'free');
      }
    });
  }

  getPrice(plan: SubscriptionPlan): number {
    return this.billingCycle === 'yearly'
      ? plan.price_yearly / 12  // Show monthly equivalent
      : plan.price_monthly;
  }

  getYearlySaving(plan: SubscriptionPlan): number {
    return (plan.price_monthly * 12) - plan.price_yearly;
  }

  formatLimit(value: number | null): string {
    return value === null ? 'Unlimited' : value.toString();
  }

  close(): void {
    this.closed.emit();
  }

  // For now redirect to contact/payment page
  // Later integrate with payment gateway (Paystack, Flutterwave, etc.)
  selectPlan(plan: SubscriptionPlan): void {
    const price = this.billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const duration = this.billingCycle === 'yearly' ? 12 : 1;

    // Open WhatsApp or email to initiate payment
    // Replace with actual payment gateway later
    const message = encodeURIComponent(
      `Hi, I'd like to upgrade my Churchman account to the ${plan.name} plan.\n` +
      `Billing: ${this.billingCycle} - GHS ${price}\n` +
      `Church: ${window.location.hostname}`
    );
    window.open(`https://wa.me/233593706706?text=${message}`, '_blank');
    this.close();
  }
}
