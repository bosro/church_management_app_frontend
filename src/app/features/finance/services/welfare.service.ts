// src/app/features/finance/services/welfare.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface WelfareSettings {
  church_id: string;
  category_id: string;
  monthly_amount: number;
  start_month: string; // YYYY-MM-DD (always the 1st)
}

export type WelfareStanding =
  | 'up_to_date'
  | 'ahead'
  | 'behind'
  | 'not_paying'
  | 'paused'
  | 'left';

export interface WelfareRow {
  member_id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  photo_url: string | null;
  enrol_status: 'active' | 'paused' | 'left';
  start_month: string;
  monthly_amount: number;
  total_paid: number;
  payments: number;
  last_payment_date: string | null;
  months_expected: number;
  months_covered: number;
  paid_through: string | null;
  credit: number;
  amount_owed: number;
  standing: WelfareStanding;
}

@Injectable({ providedIn: 'root' })
export class WelfareService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private churchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found. Please log in again.');
    return id;
  }

  async getSettings(): Promise<WelfareSettings | null> {
    const { data, error } = await this.supabase.client
      .from('welfare_settings')
      .select('*')
      .eq('church_id', this.churchId())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      church_id: data.church_id,
      category_id: data.category_id,
      monthly_amount: Number(data.monthly_amount),
      start_month: data.start_month,
    };
  }

  async saveSettings(s: {
    category_id: string;
    monthly_amount: number;
    start_month: string;
  }): Promise<void> {
    const { error } = await this.supabase.client.from('welfare_settings').upsert(
      {
        church_id: this.churchId(),
        category_id: s.category_id,
        monthly_amount: s.monthly_amount,
        start_month: s.start_month,
        updated_at: new Date().toISOString(),
        updated_by: this.authService.getUserId() || null,
      },
      { onConflict: 'church_id' },
    );
    if (error) throw new Error(error.message);
  }

  async getOverview(memberId?: string): Promise<WelfareRow[]> {
    const { data, error } = await this.supabase.client.rpc('get_welfare_overview', {
      p_church_id: this.churchId(),
      p_member_id: memberId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data || []).map((r: any) => ({
      ...r,
      monthly_amount: Number(r.monthly_amount),
      total_paid: Number(r.total_paid),
      payments: Number(r.payments),
      months_expected: Number(r.months_expected),
      months_covered: Number(r.months_covered),
      credit: Number(r.credit),
      amount_owed: Number(r.amount_owed),
    })) as WelfareRow[];
  }

  /** Enrol members (already-enrolled members are left alone). */
  async enrol(memberIds: string[]): Promise<void> {
    if (!memberIds.length) return;
    const churchId = this.churchId();
    const { error } = await this.supabase.client.from('welfare_enrollments').upsert(
      memberIds.map((member_id) => ({ church_id: churchId, member_id })),
      { onConflict: 'church_id,member_id', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }

  /** Enrol every member who has already paid into the welfare category. Returns how many were added. */
  async enrolPastPayers(categoryId: string): Promise<number> {
    const churchId = this.churchId();
    const payers = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase.client
        .from('giving_transactions')
        .select('member_id')
        .eq('church_id', churchId)
        .eq('category_id', categoryId)
        .not('member_id', 'is', null)
        .or('payment_status.eq.completed,payment_status.is.null')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      (data || []).forEach((r: any) => payers.add(r.member_id));
      if (!data || data.length < 1000) break;
    }

    const { data: existing, error: exErr } = await this.supabase.client
      .from('welfare_enrollments')
      .select('member_id')
      .eq('church_id', churchId);
    if (exErr) throw new Error(exErr.message);
    const already = new Set((existing || []).map((r: any) => r.member_id));
    const toAdd = [...payers].filter((id) => !already.has(id));
    await this.enrol(toAdd);
    return toAdd.length;
  }

  async setStatus(memberId: string, status: 'active' | 'paused' | 'left'): Promise<void> {
    const { error } = await this.supabase.client
      .from('welfare_enrollments')
      .update({ status })
      .eq('church_id', this.churchId())
      .eq('member_id', memberId);
    if (error) throw new Error(error.message);
  }

  /** month = 'YYYY-MM' or '' to follow the scheme's start month */
  async setStartMonth(memberId: string, month: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('welfare_enrollments')
      .update({ start_month: month ? `${month}-01` : null })
      .eq('church_id', this.churchId())
      .eq('member_id', memberId);
    if (error) throw new Error(error.message);
  }

  async remove(memberId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('welfare_enrollments')
      .delete()
      .eq('church_id', this.churchId())
      .eq('member_id', memberId);
    if (error) throw new Error(error.message);
  }
}