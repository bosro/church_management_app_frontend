// src/app/core/services/sms-credits.service.ts
// Super admin: SMS credit monitoring, per-church limits/blocking, top-up log, live provider balance.
// Everything goes through database functions / the sms-balance edge function (see 20261029_sms_credits.sql).
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export interface SmsChurchRow {
  church_id: string;
  name: string;
  sender_id: string | null;
  plan: string | null;
  plan_name: string | null;
  plan_limit: number | null;
  cap: number | null;
  limit: number | null;
  limit_source: 'plan' | 'override';
  blocked: boolean;
  block_reason: string | null;
  notes: string | null;
  is_complimentary: boolean;
  used: number;
  failed: number;
  all_time: number;
  last_sent: string | null;
}

export interface SmsTotals {
  month_start: string;
  sent_this_month: number;
  failed_this_month: number;
  sent_all_time: number;
  topped_up_all_time: number;
  blocked_churches: number;
}

export interface SmsOverview {
  totals: SmsTotals;
  churches: SmsChurchRow[];
}

export interface SmsChurchDetail {
  by_user: { user: string; sms: number }[];
  recent: { title: string; sms: number; failed: number; sent_at: string }[];
}

export interface SmsTopup {
  id: string;
  credits: number;
  amount_paid: number | null;
  currency: string;
  reference: string | null;
  note: string | null;
  topped_up_on: string;
  created_at: string;
}

export interface ProviderBalance {
  success: boolean;
  provider?: string;
  balance?: number | null;
  raw?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SmsCreditsService {
  constructor(private supabase: SupabaseService) {}

  /** month: 'YYYY-MM' (from <input type="month">) or empty for the current month */
  private monthToDate(month?: string): string | null {
    return month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
  }

  async getOverview(month?: string): Promise<SmsOverview> {
    const { data, error } = await this.supabase.client.rpc('admin_sms_overview', {
      p_month: this.monthToDate(month),
    });
    if (error) throw new Error(error.message);
    return data as SmsOverview;
  }

  async getChurchDetail(churchId: string, month?: string): Promise<SmsChurchDetail> {
    const { data, error } = await this.supabase.client.rpc('admin_sms_church_detail', {
      p_church_id: churchId,
      p_month: this.monthToDate(month),
    });
    if (error) throw new Error(error.message);
    return data as SmsChurchDetail;
  }

  async setControl(
    churchId: string,
    cap: number | null,
    blocked: boolean,
    reason: string | null,
    notes: string | null,
  ): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('admin_set_sms_control', {
      p_church_id: churchId,
      p_monthly_cap: cap,
      p_is_blocked: blocked,
      p_block_reason: reason,
      p_notes: notes,
    });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error || 'Could not save.');
  }

  async listTopups(): Promise<SmsTopup[]> {
    const { data, error } = await this.supabase.client
      .from('sms_topups')
      .select('*')
      .order('topped_up_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []) as SmsTopup[];
  }

  async addTopup(t: {
    credits: number;
    amount_paid: number | null;
    reference: string | null;
    note: string | null;
    topped_up_on: string;
  }): Promise<void> {
    const { error } = await this.supabase.client.from('sms_topups').insert(t);
    if (error) throw new Error(error.message);
  }

  async deleteTopup(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('sms_topups').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Live credits left at the SMS provider (server-side call, credentials never reach the browser). */
  async getProviderBalance(): Promise<ProviderBalance> {
    const { data, error } = await this.supabase.client.functions.invoke('sms-balance', { body: {} });
    if (error) return { success: false, error: error.message || 'Balance lookup failed.' };
    return data as ProviderBalance;
  }

  async getLowBalanceThreshold(): Promise<number> {
    const { data } = await this.supabase.client
      .from('platform_settings')
      .select('value')
      .eq('key', 'sms_low_balance_threshold')
      .maybeSingle();
    const n = Number(data?.value);
    return Number.isFinite(n) && n > 0 ? n : 500;
  }

  async setLowBalanceThreshold(n: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('platform_settings')
      .upsert({ key: 'sms_low_balance_threshold', value: String(n) }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
  }
}
