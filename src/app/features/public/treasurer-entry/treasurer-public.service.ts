// Everything the Service Entry screen does goes through here.
// Public link: a PIN returns a session token and every call carries it (the database checks it).
// Signed-in finance officer: the same screen, the token comes from treasurer_open_session_staff().
// The screen never touches the giving tables directly.
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase';

export interface TreasurerBootstrap {
  church_name: string;
  currency: string;
  server_today: string;          // YYYY-MM-DD in the church's time zone
  recorder_name: string;
  mode: 'pin' | 'staff';
  max_backdate_days: number;
  max_amount: number;
  undo_minutes: number;
  categories: { id: string; name: string }[];
  methods: { value: string; label: string }[];
}

export interface MemberHit { id: string; name: string; member_number: string | null; phone_hint: string | null }

export interface EntryLine { category_id: string; amount: number }

export interface RecordResult {
  success: boolean;
  error?: string;
  total?: number;
  currency?: string;
  who?: string;
  receipts?: { id: string; receipt: string | null; category: string; amount: number }[];
}

export interface TodayRow {
  id: string; time: string; who: string; category: string | null; amount: number;
  method: string; receipt: string | null; recorder: string | null; mine: boolean; can_undo: boolean;
}

export interface TodaySummary {
  date: string; total: number; count: number;
  by_category: { name: string; total: number; count: number }[];
  by_method: { method: string; total: number }[];
  rows: TodayRow[];
}

@Injectable({ providedIn: 'root' })
export class TreasurerPublicService {
  /** Emits when the database says the session is no longer valid. */
  sessionExpired$ = new Subject<void>();

  private scope = 'staff';

  constructor(private supabase: SupabaseService) {}

  /** scope = the church id for the public link, or 'staff' for the in-app screen */
  init(scope: string): void { this.scope = scope; }

  private tokenKey(): string { return `churchman_treasurer_session_${this.scope}`; }

  getToken(): string | null {
    try { return sessionStorage.getItem(this.tokenKey()); } catch { return null; }
  }
  private setToken(t: string): void {
    try { sessionStorage.setItem(this.tokenKey(), t); } catch { /* ignore */ }
  }
  clearSession(): void {
    try { sessionStorage.removeItem(this.tokenKey()); } catch { /* ignore */ }
  }

  // ── Opening a session ───────────────────────────────────────
  async accessInfo(churchId: string): Promise<{ enabled: boolean; requires_pin?: boolean; church_name: string | null }> {
    const { data, error } = await this.supabase.client.rpc('treasurer_access_info', { p_church_id: churchId });
    if (error) throw new Error(error.message);
    return data as { enabled: boolean; requires_pin?: boolean; church_name: string | null };
  }

  async verifyPin(churchId: string, pin: string, recorderName: string): Promise<{ ok: boolean; error?: string; locked?: boolean; attempts_left?: number }> {
    const { data, error } = await this.supabase.client.rpc('treasurer_verify_pin', {
      p_church_id: churchId, p_pin: pin, p_recorder_name: recorderName,
    });
    if (error) throw new Error(error.message);
    if (data?.ok && data.token) this.setToken(data.token);
    return data;
  }

  /** Open link (the church chose "no PIN"): only a name is needed. */
  async openSession(churchId: string, recorderName: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.client.rpc('treasurer_open_session', {
      p_church_id: churchId, p_recorder_name: recorderName,
    });
    if (error) throw new Error(error.message);
    if (data?.ok && data.token) this.setToken(data.token);
    return data;
  }

  /** Signed-in finance officer / church admin. */
  async openStaffSession(): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.client.rpc('treasurer_open_session_staff', { p_recorder_name: null });
    if (error) throw new Error(error.message);
    if (data?.ok && data.token) this.setToken(data.token);
    return data;
  }

  // ── Calls that carry the token ──────────────────────────────
  private async call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const token = this.getToken();
    if (!token) { this.sessionExpired$.next(); throw new Error('SESSION_EXPIRED'); }
    const { data, error } = await this.supabase.client.rpc(fn, { p_token: token, ...args });
    if (error) {
      if ((error.message || '').includes('SESSION_EXPIRED')) {
        this.clearSession();
        this.sessionExpired$.next();
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error(error.message);
    }
    return data as T;
  }

  bootstrap(): Promise<TreasurerBootstrap> { return this.call('treasurer_bootstrap'); }

  async searchMembers(q: string): Promise<MemberHit[]> {
    return (await this.call<MemberHit[]>('treasurer_search_members', { p_query: q })) || [];
  }

  record(p: {
    memberId: string | null; payerName: string | null; payerContact: string | null; method: string;
    date: string | null; reference: string | null; notes: string | null; lines: EntryLine[]; clientKey: string;
  }): Promise<RecordResult> {
    return this.call('treasurer_record', {
      p_member_id: p.memberId, p_payer_name: p.payerName, p_payer_contact: p.payerContact, p_method: p.method,
      p_date: p.date, p_reference: p.reference, p_notes: p.notes, p_lines: p.lines, p_client_key: p.clientKey,
    });
  }

  today(date?: string): Promise<TodaySummary> { return this.call('treasurer_today', { p_date: date ?? null }); }

  async undo(id: string): Promise<{ success: boolean; error?: string }> {
    return this.call('treasurer_undo', { p_id: id });
  }

  async endSession(): Promise<void> {
    const token = this.getToken();
    this.clearSession();
    if (token) { try { await this.supabase.client.rpc('treasurer_end_session', { p_token: token }); } catch { /* ignore */ } }
  }
}
