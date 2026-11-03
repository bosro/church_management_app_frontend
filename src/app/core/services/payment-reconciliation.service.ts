// src/app/core/services/payment-reconciliation.service.ts
// Super admin: find Paystack payments stuck at "pending" and check them directly with Paystack.
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export interface PendingPayment {
  id: string;
  created_at: string;
  age_minutes: number;
  church_id: string | null;
  church_name: string | null;
  category: string | null;
  payer_name: string | null;
  payer_contact: string | null;
  amount: number;
  currency: string | null;
  reference: string;
  is_commitment: boolean;
  source: string | null;
}

export interface PendingList { total: number; total_amount: number; rows: PendingPayment[] }

export type Outcome = 'completed' | 'failed' | 'abandoned' | 'still_pending' | 'needs_review' | 'already_done' | 'error';

export interface CheckResult { id: string; reference: string; outcome: Outcome; detail: string; paid?: number }

export interface WebhookProblem {
  reference: string | null;
  event: string | null;
  processed: boolean | null;
  error: string | null;
  created_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentReconciliationService {
  constructor(private supabase: SupabaseService) {}

  async getPending(minAgeMinutes: number): Promise<PendingList> {
    const { data, error } = await this.supabase.client.rpc('admin_list_pending_payments', {
      p_min_age_minutes: minAgeMinutes,
      p_limit: 200,
    });
    if (error) throw new Error(error.message);
    return data as PendingList;
  }

  async getWebhookProblems(): Promise<WebhookProblem[]> {
    const { data, error } = await this.supabase.client.rpc('admin_webhook_problems', { p_limit: 50 });
    if (error) throw new Error(error.message);
    return (data || []) as WebhookProblem[];
  }

  /** Asks Paystack (server-side) about up to 50 pending payments and updates the ones that are settled. */
  async check(ids: string[], minAgeMinutes: number): Promise<{ results: CheckResult[]; summary: Record<string, number> }> {
    const { data, error } = await this.supabase.client.functions.invoke('paystack-reconcile', {
      body: { ids, min_age_minutes: minAgeMinutes },
    });
    if (error) throw new Error(error.message || 'Could not reach the reconciliation service.');
    if (!data?.success) throw new Error(data?.error || 'Reconciliation failed.');
    return { results: data.results as CheckResult[], summary: data.summary };
  }
}
