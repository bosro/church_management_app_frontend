
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-building-campaign-payment-callback',
  standalone: false,
  template: `
    <div class="callback-wrap">
      <div class="callback-card">
        <ng-container *ngIf="loading">
          <div class="spinner"></div>
          <p>Verifying your payment…</p>
        </ng-container>
        <ng-container *ngIf="!loading && success">
          <div class="icon success-icon"><i class="ri-checkbox-circle-line"></i></div>
          <h2>Payment successful!</h2>
          <p>Your building campaign payment of <strong>GHS {{ amount | number:'1.2-2' }}</strong> has been received and recorded.</p>
          <p class="ref">Ref: {{ reference }}</p>
        </ng-container>
        <ng-container *ngIf="!loading && !success">
          <div class="icon error-icon"><i class="ri-close-circle-line"></i></div>
          <h2>Payment could not be verified</h2>
          <p>{{ errorMessage }}</p>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .callback-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f9fafb; padding: 1rem; }
    .callback-card { background: white; border-radius: 16px; padding: 3rem 2rem; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    .success-icon { color: #059669; }
    .error-icon { color: #dc2626; }
    h2 { font-size: 1.5rem; font-weight: 800; color: #111827; margin: 0 0 0.75rem; }
    p { color: #6b7280; margin: 0 0 0.5rem; }
    .ref { font-family: monospace; font-size: 0.875rem; color: #9ca3af; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #5b21b6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class BuildingCampaignPaymentCallback implements OnInit {
  loading = true;
  success = false;
  errorMessage = '';
  reference = '';
  amount = 0;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.reference = this.route.snapshot.queryParamMap.get('reference') || '';
    if (!this.reference) {
      this.loading = false;
      this.errorMessage = 'No payment reference found.';
      return;
    }

    // Poll for up to 10s for the webhook to process
    let attempts = 0;
    const check = async () => {
      const { data } = await this.supabase.client
        .from('giving_transactions')
        .select('payment_status, amount')
        .or(`paystack_reference.eq.${this.reference},transaction_reference.eq.${this.reference}`)
        .single();

      if (data?.payment_status === 'completed') {
        this.amount = data.amount;
        this.success = true;
        this.loading = false;
      } else if (attempts++ < 5) {
        setTimeout(check, 2000);
      } else {
        this.loading = false;
        this.errorMessage = 'Payment is still being processed. Please check back shortly.';
      }
    };
    await check();
  }
}
