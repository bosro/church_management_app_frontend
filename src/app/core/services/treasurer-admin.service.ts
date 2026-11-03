// Church admin / finance officer: set up and watch the Treasurer Service Entry link.
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export interface TreasurerSettings {
  church_id: string;
  is_enabled: boolean;
  has_pin: boolean;
  pin_set_at: string | null;
  locked_until: string | null;
  max_backdate_days: number;
  max_amount: number;
  undo_minutes: number;
  open_sessions: number;
}

export interface TreasurerEntryRow {
  id: string; date: string; time: string; who: string; category: string | null; amount: number;
  currency: string | null; method: string; receipt: string | null; recorder: string | null; via: string | null;
}

@Injectable({ providedIn: 'root' })
export class TreasurerAdminService {
  constructor(private supabase: SupabaseService) {}

  private async rpc(fn: string, args: Record<string, unknown> = {}): Promise<any> {
    const { data, error } = await this.supabase.client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  }

  private async rpcOk(fn: string, args: Record<string, unknown>, fallback: string): Promise<any> {
    const data = await this.rpc(fn, args);
    if (!data?.success) throw new Error(data?.error || fallback);
    return data;
  }

  getSettings(): Promise<TreasurerSettings> { return this.rpc('treasurer_get_settings'); }

  saveSettings(s: { enabled: boolean; maxBackdateDays: number; maxAmount: number; undoMinutes: number }): Promise<any> {
    return this.rpcOk('treasurer_save_settings', {
      p_enabled: s.enabled, p_max_backdate_days: s.maxBackdateDays, p_max_amount: s.maxAmount, p_undo_minutes: s.undoMinutes,
    }, 'Could not save the settings.');
  }

  setPin(pin: string): Promise<any> { return this.rpcOk('treasurer_set_pin', { p_pin: pin }, 'Could not set the PIN.'); }

  async revokeSessions(): Promise<number> {
    const d = await this.rpcOk('treasurer_revoke_sessions', {}, 'Could not sign everyone out.');
    return d.revoked ?? 0;
  }

  entries(from: string, to: string): Promise<{ total: number; count: number; rows: TreasurerEntryRow[] }> {
    return this.rpc('treasurer_admin_entries', { p_from: from || null, p_to: to || null, p_limit: 500 });
  }
}
