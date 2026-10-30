// src/app/core/services/sender-id.service.ts
// SMS sender ID requests.
//   Church side:  see their sender IDs, add one (instantly if GiantSMS already approved it), pick a default, cancel/remove
//   Super admin:  list requests, mark "processing", approve (switches it on), reject
// All writes go through database functions (see 20261028_sms_sender_id_requests.sql).
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

export type SenderRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';

export interface MySenderInfo {
  found: boolean;
  church_id?: string;
  church_name?: string;
  /** null = this church uses the platform default */
  current_sender_id?: string | null;
  default_sender_id?: string;
  /** what recipients actually see */
  effective_sender_id?: string;
  can_request?: boolean;
  open_request?: {
    id: string;
    requested_sender_id: string;
    status: SenderRequestStatus;
    notes?: string | null;
    created_at: string;
  } | null;
  /** every open request (a church can have several at once) */
  open_requests?: NonNullable<MySenderInfo['open_request']>[];
  /** every sender ID the church may use; the one with is_default is used when a message doesn't pick one */
  sender_ids?: ChurchSenderId[];
}

export interface ChurchSenderId {
  id: string;
  sender_id: string;
  source: 'request' | 'provider_auto' | 'admin' | 'legacy';
  is_default: boolean;
  created_at: string;
}

export type CheckOutcome =
  | 'granted' | 'already_yours' | 'taken' | 'provider_declined' | 'needs_request' | 'unverified';

export interface CheckResult {
  outcome: CheckOutcome;
  message?: string;
  sender_id?: string;
  provider_status?: string;
}

export type ProviderStatus = 'approved' | 'pending' | 'declined';
export interface ProviderSender { name: string; status: ProviderStatus; raw_status: string }

export interface ChurchPick { id: string; name: string; emails: string[] }

export interface AdminSenderIdRow {
  id: string;
  church_id: string;
  church_name: string;
  sender_id: string;
  source: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface SenderIdRequest {
  id: string;
  church_id: string;
  requested_by: string | null;
  requested_sender_id: string;
  notes: string | null;
  status: SenderRequestStatus;
  rejection_reason: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  church?: { name: string; sms_sender_id: string | null } | null;
  requester?: { full_name?: string | null; email?: string | null } | null;
}

export type ReviewAction = 'processing' | 'approve' | 'reject';

interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
}

@Injectable({ providedIn: 'root' })
export class SenderIdService {
  constructor(private supabase: SupabaseService) {}

  // ── Church side ────────────────────────────────────────────

  async getMyInfo(): Promise<MySenderInfo> {
    const { data, error } = await this.supabase.client.rpc('get_my_sms_sender_info');
    if (error) throw new Error(error.message);
    return (data || { found: false }) as MySenderInfo;
  }

  /** The signed-in church's own requests, newest first (row security limits this to staff of that church). */
  async getMyRequests(): Promise<SenderIdRequest[]> {
    const { data, error } = await this.supabase.client
      .from('sms_sender_id_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data || []) as SenderIdRequest[];
  }

  async submitRequest(senderId: string, notes: string): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('request_sms_sender_id', {
      p_sender_id: senderId,
      p_notes: notes?.trim() || null,
    });
    if (error) throw new Error(error.message);
    const r = data as RpcResult;
    if (!r?.success) throw new Error(r?.error || 'Could not submit the request.');
    this.notify('submitted', r.id!);
    return r.id!;
  }

  async cancelRequest(id: string): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('cancel_sms_sender_id_request', { p_id: id });
    if (error) throw new Error(error.message);
    const r = data as RpcResult;
    if (!r?.success) throw new Error(r?.error || 'Could not cancel the request.');
  }

  async resetToDefault(): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('reset_sms_sender_id');
    if (error) throw new Error(error.message);
    const r = data as RpcResult;
    if (!r?.success) throw new Error(r?.error || 'Could not switch back to the default.');
  }

  /**
   * Add a sender ID: asks the server whether GiantSMS has already approved the name.
   * - granted: the church can use it straight away
   * - needs_request: submitted as a normal request for the platform admin to review
   * Throws with a friendly message when the name can't be used.
   */
  async addSenderId(senderId: string, notes: string): Promise<CheckResult> {
    const { data, error } = await this.supabase.client.functions.invoke('sender-id-check', {
      body: { action: 'check', sender_id: senderId },
    });

    let check: CheckResult | null = null;
    if (!error && data?.success) check = data as CheckResult;
    else if (!error && data?.error) throw new Error(data.error);
    // If the check function is unreachable or not deployed yet, fall back to the normal request flow
    if (!check) check = { outcome: 'unverified' };

    switch (check.outcome) {
      case 'granted':
        return check;
      case 'already_yours':
      case 'taken':
      case 'provider_declined':
        throw new Error(check.message || 'That sender ID cannot be used.');
      default:
        await this.submitRequest(senderId, notes);
        return check;
    }
  }

  async setDefaultSenderId(id: string): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('set_my_default_sender_id', { p_id: id });
    if (error) throw new Error(error.message);
    if (!(data as RpcResult)?.success) throw new Error((data as RpcResult)?.error || 'Could not change the default.');
  }

  async removeSenderId(id: string): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('remove_my_sender_id', { p_id: id });
    if (error) throw new Error(error.message);
    if (!(data as RpcResult)?.success) throw new Error((data as RpcResult)?.error || 'Could not remove the sender ID.');
  }

  // ── Super admin side ───────────────────────────────────────

  // ── Super admin fix-up tools ───────────────────────────────

  private async adminRpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<any> {
    const { data, error } = await this.supabase.client.rpc(fn, args);
    if (error) throw new Error(error.message);
    if (!(data as RpcResult)?.success) throw new Error((data as RpcResult)?.error || fallback);
    return data;
  }

  renameSenderId(id: string, newName: string): Promise<any> {
    return this.adminRpc('admin_rename_sender_id', { p_id: id, p_new_name: newName }, 'Could not rename.');
  }

  moveSenderId(id: string, toChurchId: string): Promise<any> {
    return this.adminRpc('admin_move_sender_id', { p_id: id, p_to_church: toChurchId }, 'Could not move.');
  }

  editOpenRequest(requestId: string, newName: string | null, toChurchId: string | null): Promise<any> {
    return this.adminRpc('admin_edit_sender_request',
      { p_request_id: requestId, p_new_name: newName, p_to_church: toChurchId }, 'Could not update the request.');
  }

  /** Fix capital letters to match exactly what GiantSMS lists. Returns what changed. */
  async syncCasing(providerNames: string[]): Promise<{ from: string; to: string }[]> {
    const data = await this.adminRpc('admin_sync_sender_id_casing', { p_names: providerNames }, 'Could not match names.');
    return (data.changed || []) as { from: string; to: string }[];
  }

  async listChurchesForPicker(): Promise<ChurchPick[]> {
    const { data, error } = await this.supabase.client
      .from('churches')
      .select('id, name, email, contact_email, billing_email, admin_notification_email')
      .order('name');
    if (error) throw new Error(error.message);
    return (data || []).map((c: any) => ({
      id: c.id,
      name: (c.name || '').trim(),
      emails: [c.email, c.contact_email, c.billing_email, c.admin_notification_email].filter(Boolean),
    }));
  }

  /** The church that a user account (by email) belongs to. */
  async churchIdForUserEmail(email: string): Promise<string | null> {
    const { data } = await this.supabase.client
      .from('profiles').select('church_id').ilike('email', email.trim()).not('church_id', 'is', null).limit(1);
    return data?.[0]?.church_id ?? null;
  }

  /** Every sender ID at GiantSMS with its approval status (null if GiantSMS can't be reached). */
  async getProviderSenders(): Promise<{ senders: ProviderSender[] | null; error?: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('sender-id-check', {
      body: { action: 'provider_list' },
    });
    if (error) return { senders: null, error: error.message };
    if (!data?.success) return { senders: null, error: data?.error || 'Could not reach GiantSMS.' };
    return { senders: data.senders as ProviderSender[] };
  }

  /** Registers the requested name at GiantSMS (it then shows as pending there). */
  async registerAtProvider(requestId: string): Promise<string> {
    const { data, error } = await this.supabase.client.functions.invoke('sender-id-check', {
      body: { action: 'register', request_id: requestId },
    });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.message || data?.error || 'GiantSMS did not accept the registration.');
    return data.message || 'Registered at GiantSMS.';
  }

  async listAllSenderIds(): Promise<AdminSenderIdRow[]> {
    const { data, error } = await this.supabase.client.rpc('admin_list_sender_ids');
    if (error) throw new Error(error.message);
    return (data || []) as AdminSenderIdRow[];
  }

  async setSenderIdActive(id: string, active: boolean): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('admin_set_sender_id_active', { p_id: id, p_active: active });
    if (error) throw new Error(error.message);
    if (!(data as RpcResult)?.success) throw new Error((data as RpcResult)?.error || 'Could not update.');
  }

  async getAutoGrant(): Promise<boolean> {
    const { data } = await this.supabase.client.from('platform_settings').select('value').eq('key', 'sender_id_auto_grant').maybeSingle();
    return (data?.value ?? 'true') === 'true';
  }

  async setAutoGrant(on: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('platform_settings')
      .upsert({ key: 'sender_id_auto_grant', value: on ? 'true' : 'false' }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
  }

  async listRequests(status?: SenderRequestStatus | 'open'): Promise<SenderIdRequest[]> {
    let q = this.supabase.client
      .from('sms_sender_id_requests')
      .select('*, church:churches!church_id(name, sms_sender_id), requester:profiles!requested_by(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status === 'open') q = q.in('status', ['pending', 'processing']);
    else if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as unknown as SenderIdRequest[];
  }

  async countOpen(): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('sms_sender_id_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']);
    if (error) return 0;
    return count || 0;
  }

  async review(id: string, action: ReviewAction, reason?: string, adminNotes?: string): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('review_sms_sender_id_request', {
      p_id: id,
      p_action: action,
      p_reason: reason?.trim() || null,
      p_admin_notes: adminNotes?.trim() || null,
    });
    if (error) throw new Error(error.message);
    const r = data as RpcResult;
    if (!r?.success) throw new Error(r?.error || 'Could not update the request.');
    if (action === 'approve') this.notify('approved', id);
    if (action === 'reject') this.notify('rejected', id);
  }

  // ── helpers ────────────────────────────────────────────────

  /** Fire-and-forget e-mail/SMS. Never blocks or fails the main action. */
  private notify(event: 'submitted' | 'approved' | 'rejected', requestId: string): void {
    this.supabase.client.functions
      .invoke('notify-sender-id-request', { body: { event, request_id: requestId } })
      .catch((e: unknown) => console.warn('notify-sender-id-request failed (ignored):', e));
  }

  /** Same rule the database enforces — lets the form give instant feedback. */
  static validate(raw: string): string | null {
    const v = (raw || '').trim().replace(/\s+/g, ' ');
    if (v.length < 3) return 'At least 3 characters.';
    if (v.length > 11) return 'At most 11 characters.';
    if (!/^[A-Za-z0-9 ]+$/.test(v)) return 'Letters and numbers only (spaces allowed).';
    if (!/[A-Za-z]/.test(v)) return 'Must contain at least one letter.';
    return null;
  }
}
