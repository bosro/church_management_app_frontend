import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

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
   * Poll our DB to see if the webhook has marked the transaction completed.
   * Returns the payment_status string or null if not found.
   */
  async getPaymentStatus(
    reference: string
  ): Promise<'pending' | 'completed' | 'failed' | 'abandoned' | null> {
    const { data, error } = await this.supabase.client
      .from('giving_transactions')
      .select('payment_status')
      .eq('paystack_reference', reference)
      .single();

    if (error || !data) return null;
    return data.payment_status as any;
  }
}


