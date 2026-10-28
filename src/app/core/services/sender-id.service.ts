// src/app/core/services/sender-id.service.ts
// SMS sender ID requests.
//   Church side:  see current/default sender ID, request a new one, cancel, go back to default
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

  // ── Super admin side ───────────────────────────────────────

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
