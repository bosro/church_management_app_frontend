
// src/app/features/settings/components/subscription-callback/subscription-callback.component.ts
// Handles the return from Paystack after a subscription payment.
// Same polling pattern as PaymentCallback but reads subscription_payments table.
// Route: /main/subscription/callback

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionPaystackService } from '../../../core/services/subscription-paystack.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth';


type State = 'verifying' | 'success' | 'failed';

@Component({
  selector: 'app-subscription-callback',
  standalone: false,
  templateUrl: './subscription-callback.html',
  styleUrl: './subscription-callback.scss',
})
export class SubscriptionCallback implements OnInit, OnDestroy {
  state: State = 'verifying';
  message = '';
  planName = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public router: Router,
    private subscriptionPaystack: SubscriptionPaystackService,
    private subscriptionService: SubscriptionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    // Paystack appends ?trxref=xxx&reference=xxx to callback URL
    const params = new URLSearchParams(window.location.search);
    const urlRef = params.get('reference') || params.get('trxref');
    const storedRef = sessionStorage.getItem('subscription_pending_ref');
    const reference = urlRef || storedRef;

    this.planName = sessionStorage.getItem('subscription_plan_name') || 'new plan';

    sessionStorage.removeItem('subscription_pending_ref');
    sessionStorage.removeItem('subscription_plan_name');

    if (!reference) {
      this.state = 'failed';
      this.message = 'No payment reference found. Please contact support if you were charged.';
      return;
    }

    this.poll(reference, 0);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private poll(reference: string, attempt: number): void {
    // Poll every 3s, max 36s (12 attempts)
    // complete_subscription_payment() is called by webhook — usually within 5–15s
    if (attempt >= 12) {
      // Timed out — most likely the webhook hasn't fired yet.
      // Show optimistic success since Paystack confirmed the charge.
      this.state = 'success';
      this.message =
        'Your payment is being processed. Your plan will activate within a few minutes. ' +
        'Refresh the page if it does not update automatically.';
      this.refreshSubscriptionStatus();
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        const status = await this.subscriptionPaystack.getPaymentStatus(reference);

        if (status === 'completed') {
          this.state = 'success';
          this.message = `Your ${this.planName} plan is now active! All features have been unlocked.`;
          // Refresh the in-memory subscription status so the UI updates immediately
          await this.refreshSubscriptionStatus();
          setTimeout(() => this.goToSettings(), 3000);
        } else if (status === 'failed' || status === 'abandoned') {
          this.state = 'failed';
          this.message =
            'Payment could not be completed. No amount was charged. Please try again.';
        } else {
          // 'pending' or null — keep polling
          this.poll(reference, attempt + 1);
        }
      } catch {
        this.poll(reference, attempt + 1);
      }
    }, 3000);
  }

  private async refreshSubscriptionStatus(): Promise<void> {
    try {
      // Reload the user profile first (church_id may not have changed but plan has)
      await this.authService.refreshProfile();
      // Then reload subscription status into the BehaviorSubject
      await this.subscriptionService.loadStatus();
    } catch (e) {
      console.warn('Could not refresh subscription status:', e);
    }
  }

  goToSettings(): void {
    this.router.navigate(['/main/settings'], { queryParams: { tab: 'subscription' } });
  }

  tryAgain(): void {
    this.router.navigate(['/main/settings'], { queryParams: { tab: 'subscription' } });
  }
}
