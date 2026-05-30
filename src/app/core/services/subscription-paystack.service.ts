// src/app/core/services/subscription-paystack.service.ts
// Handles Paystack payments for subscription upgrades.
// Completely separate from the giving flow — writes to subscription_payments table.

import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface SubscriptionPaymentInit {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'abandoned'
  | null;

export interface SubscriptionPaymentRecord {
  id: string;
  church_id: string;
  plan_id: string;
  duration_months: number;
  amount: number;
  currency: string;
  billing_email: string | null;
  paystack_reference: string;
  status: SubscriptionPaymentStatus;
  completed_at: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionPaystackService {
  // Paystack fee config — mirrors platform_settings loaded by PaymentForm
  // These are defaults; loadFeeSettings() overwrites them on init
  paystackFeePercent = 1.95;
  platformFeePercent = 0.20;
  passFeesToPayer = true;
  feeSettingsLoaded = false;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {
    this.loadFeeSettings();
  }

  // ── Fee settings ────────────────────────────────────────────────────────────

  loadFeeSettings(): Promise<void> {
    return Promise.resolve(
      this.supabase.client
        .from('platform_settings')
        .select('key, value')
        .in('key', ['paystack_fee_percent', 'platform_fee_percent', 'pass_fees_to_payer'])
        .then(({ data }) => {
          if (!data) return;
          const map: Record<string, string> = {};
          data.forEach((s: any) => (map[s.key] = s.value));
          if (map['paystack_fee_percent'])
            this.paystackFeePercent = parseFloat(map['paystack_fee_percent']);
          if (map['platform_fee_percent'])
            this.platformFeePercent = parseFloat(map['platform_fee_percent']);
          if (map['pass_fees_to_payer'])
            this.passFeesToPayer = map['pass_fees_to_payer'] !== 'false';
          this.feeSettingsLoaded = true;
        }),
    );
  }

  get totalFeePercent(): number {
    return this.paystackFeePercent + this.platformFeePercent;
  }

  // Given the plan price, calculate what the customer is actually charged
  // (fee passed to payer, same formula as PaymentForm)
  calculateChargeAmount(planPrice: number): number {
    if (!planPrice || !this.passFeesToPayer) return planPrice;
    const rate = this.totalFeePercent / 100;
    return Math.ceil((planPrice / (1 - rate)) * 100) / 100;
  }

  calculateFeeAmount(planPrice: number): number {
    return Math.max(0, this.calculateChargeAmount(planPrice) - planPrice);
  }

  // ── Initialize payment ──────────────────────────────────────────────────────

  async initializePayment(params: {
    planId: string;
    planName: string;
    durationMonths: number;
    planPrice: number;        // the plan's actual price (monthly or yearly/12)
    billingEmail: string;
    churchId: string;
  }): Promise<SubscriptionPaymentInit> {
    const { data: { session }, error: sessionErr } =
      await this.supabase.client.auth.getSession();

    if (sessionErr || !session) {
      throw new Error('You must be logged in to upgrade your plan.');
    }

    const chargeAmount = this.calculateChargeAmount(params.planPrice);

    const supabaseUrl: string =
      (this.supabase.client as any).supabaseUrl ??
      (this.supabase.client as any).rest?.url?.replace('/rest/v1', '') ??
      '';

    const res = await fetch(
      `${supabaseUrl}/functions/v1/paystack-initialize-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: params.planId,
          plan_name: params.planName,
          duration_months: params.durationMonths,
          amount: chargeAmount,          // charge amount (with fee)
          plan_price: params.planPrice,  // original plan price (church receives this)
          billing_email: params.billingEmail,
          church_id: params.churchId,
        }),
      },
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Payment initialization failed');
    }

    return data as SubscriptionPaymentInit;
  }

  // ── Poll payment status ─────────────────────────────────────────────────────
  // Polls subscription_payments table — same pattern as PaystackService.getPaymentStatus()

  async getPaymentStatus(reference: string): Promise<SubscriptionPaymentStatus> {
    const { data, error } = await this.supabase.client
      .from('subscription_payments')
      .select('status')
      .eq('paystack_reference', reference)
      .single();

    if (error || !data) return null;
    return data.status as SubscriptionPaymentStatus;
  }

  // ── Get payment record (for success screen) ─────────────────────────────────

  async getPaymentRecord(reference: string): Promise<SubscriptionPaymentRecord | null> {
    const { data, error } = await this.supabase.client
      .from('subscription_payments')
      .select('*')
      .eq('paystack_reference', reference)
      .single();

    if (error || !data) return null;
    return data as SubscriptionPaymentRecord;
  }

  // ── Get payment history for a church ───────────────────────────────────────

  getPaymentHistory(churchId: string): Observable<SubscriptionPaymentRecord[]> {
    return from(
      this.supabase.client
        .from('subscription_payments')
        .select('*')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(20),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as SubscriptionPaymentRecord[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }
}
