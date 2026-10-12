import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

export interface PledgeInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
  charge_amount: number;
  platform_fee: number;
  pledge_amount: number;
  remaining_after: number;
}

export interface PaystackInitResult {
  authorization_url: string;
  access_code: string;
  reference: string;
  txn_id: string;
}

@Injectable({ providedIn: 'root' })
export class PaystackService {

  constructor(private supabase: SupabaseService) {}

  async initializePayment(params: {
    amount: number;
    category_id: string;
    church_id: string;
    notes?: string;
  }): Promise<PaystackInitResult> {
    const { data: { session }, error } =
      await this.supabase.client.auth.getSession();

    if (error || !session) {
      throw new Error('You must be logged in to make a payment.');
    }

    // Pull supabaseUrl off the client — works for both v1 and v2
    const supabaseUrl: string =
      (this.supabase.client as any).supabaseUrl ??
      (this.supabase.client as any).rest?.url?.replace('/rest/v1', '') ??
      '';

    const res = await fetch(
      `${supabaseUrl}/functions/v1/paystack-initialize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Payment initialization failed');
    }

    return data as PaystackInitResult;
  }

  /**
   * Start an ONLINE payment towards a pledge (edge function paystack-initialize-pledge).
   *  mode 'self' = a member pays their own pledge
   *  mode 'link' = staff creates a pay link for someone's pledge (payer_email optional)
   */
  async initializePledgePayment(params: {
    pledge_id: string;
    amount: number;
    mode?: 'self' | 'link';
    payer_email?: string;
  }): Promise<PledgeInitResult> {
    const { data: { session }, error } = await this.supabase.client.auth.getSession();
    if (error || !session) throw new Error('You must be logged in.');

    const supabaseUrl: string =
      (this.supabase.client as any).supabaseUrl ??
      (this.supabase.client as any).rest?.url?.replace('/rest/v1', '') ??
      '';

    const res = await fetch(`${supabaseUrl}/functions/v1/paystack-initialize-pledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start the payment');
    return data as PledgeInitResult;
  }

  /**
   * Poll our DB to see if the webhook has marked the transaction completed.
   * Returns the payment_status string or null if not found.
   */
  async getPaymentStatus(
    reference: string
  ): Promise<'pending' | 'completed' | 'failed' | 'abandoned' | null> {
    // Pledge payments (reference PLG-…) are tracked in pledge_payment_intents
    if (reference.startsWith('PLG-')) {
      const { data: intent } = await this.supabase.client
        .from('pledge_payment_intents')
        .select('status')
        .eq('reference', reference)
        .maybeSingle();
      return (intent?.status as any) ?? null;
    }

    const { data, error } = await this.supabase.client
      .from('giving_transactions')
      .select('payment_status')
      .eq('paystack_reference', reference)
      .single();

    if (error || !data) return null;
    return data.payment_status as any;
  }
}




