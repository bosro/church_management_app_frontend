// src/app/features/communications/services/communications.service.ts
// CHANGES:
// 1. createCommunication() accepts target_member_id
// 2. pollSendProgress() — polls sms_logs/email_logs after triggering send
// 3. getSendProgress() — single snapshot query for progress bar
// 4. Everything else unchanged

import { Injectable } from '@angular/core';
import { Observable, ReplaySubject, from, throwError, interval, of } from 'rxjs';
import { map, catchError, switchMap, takeWhile, startWith } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import {
  Communication,
  CommunicationType,
  CommunicationStatus,
  TargetAudience,
  SmsLog,
  EmailLog,
  CommunicationStatistics,
} from '../../../models/communication.model';

export interface SendProgress {
  /** recipients being messaged (known as soon as the server starts sending); 0 = not known yet */
  total: number;
  /** recipients already processed */
  processed: number;
  /** individual SMS / emails delivered so far */
  sent: number;
  /** individual SMS / emails that failed so far */
  failed: number;
  percent: number;
  done: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class CommunicationsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private toast: ToastService,
  ) {}

  // ==================== PERMISSIONS ====================

  canManageCommunications(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewCommunications(): boolean {
    const roles = [
      'super_admin', 'church_admin', 'pastor',
      'ministry_leader', 'secretary',
    ];
    return this.authService.hasRole(roles);
  }

  canSendCommunications(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor'];
    return this.authService.hasRole(roles);
  }

  // ==================== COMMUNICATIONS CRUD ====================

  getCommunications(
    page: number = 1,
    pageSize: number = 20,
    filters?: { status?: CommunicationStatus; type?: CommunicationType },
  ): Observable<{ data: Communication[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('communications')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        if (isBranchPastor && branchId) query = query.eq('branch_id', branchId);
        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.type) query = query.eq('communication_type', filters.type);

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as Communication[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getCommunicationById(communicationId: string): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('communications')
        .select('*')
        .eq('id', communicationId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Communication not found');
        return data as Communication;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // UPDATED: accepts optional target_member_id
createCommunication(communicationData: {
    title: string;
    message: string;
    communication_type: CommunicationType;
    target_audience: TargetAudience;
    scheduled_at?: string;
    target_member_id?: string | null;
    custom_member_ids?: string[] | null;   // ← NEW
    sender_id?: string | null;             // SMS sender ID chosen for this message
  }): Observable<Communication> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();
    const branchId = this.authService.getBranchId();

    return from(
      this.supabase.insert<Communication>('communications', {
        church_id: churchId,
        branch_id: branchId || null,
        title: communicationData.title.trim(),
        message: communicationData.message.trim(),
        communication_type: communicationData.communication_type,
        target_audience: communicationData.target_audience,
        target_member_id: communicationData.target_member_id || null,
        custom_member_ids: communicationData.custom_member_ids || null,  // ← NEW
        // only included when a sender ID was chosen, so nothing changes for churches with a single ID
        ...(communicationData.sender_id ? { sender_id: communicationData.sender_id } : {}),
        scheduled_at: communicationData.scheduled_at || null,
        status: communicationData.scheduled_at ? 'scheduled' : 'draft',
        created_by: userId,
      } as any),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create communication');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }


  updateCommunication(
    communicationId: string,
    communicationData: Partial<Communication>,
  ): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('communications')
          .select('id, status')
          .eq('id', communicationId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Communication not found or access denied');
        if (existing.status === 'sent') throw new Error('Cannot edit a sent communication');

        return this.supabase.update<Communication>(
          'communications',
          communicationId,
          { ...communicationData, updated_at: new Date().toISOString() },
        );
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update communication');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteCommunication(communicationId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('communications')
          .select('id, status')
          .eq('id', communicationId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Communication not found or access denied');
        if (existing.status === 'sent') throw new Error('Cannot delete a sent communication');

        return this.supabase.delete('communications', communicationId);
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== SEND ====================

  sendCommunication(communicationId: string): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: communication, error: fetchErr } =
          await this.supabase.client
            .from('communications')
            .select('*')
            .eq('id', communicationId)
            .eq('church_id', churchId)
            .single();

        if (fetchErr || !communication)
          throw new Error('Communication not found or access denied');
        if (communication.status === 'sent')
          throw new Error('Communication already sent');
        if (communication.status === 'sending')
          throw new Error('Communication is already being sent');

        const { data: fnData, error: fnErr } =
          await this.supabase.client.functions.invoke('send-communication', {
            body: { communicationId },
          });

        if (fnErr) {
          await this.supabase.client
            .from('communications')
            .update({ status: 'draft' })
            .eq('id', communicationId);
          throw new Error(fnErr.message || 'Edge function failed');
        }

        if (!fnData?.success) {
          // Plan blocks (feature not in plan / SMS allowance used up) keep the message as a draft
          const planBlocked = ['FEATURE_LOCKED', 'SMS_LIMIT_REACHED', 'SMS_BLOCKED', 'SMS_CAP_REACHED'].includes(fnData?.code);
          await this.supabase.client
            .from('communications')
            .update({ status: planBlocked ? 'draft' : 'failed' })
            .eq('id', communicationId);
          throw new Error(fnData?.error || 'Send failed');
        }

        const { data: updated } = await this.supabase.client
          .from('communications')
          .select('*')
          .eq('id', communicationId)
          .single();

        return updated as Communication;
      })(),
    ).pipe(catchError((err) => { console.error('Error sending communication:', err); return throwError(() => err); }));
  }

  // ==================== PROGRESS POLLING ====================
  // Polls every 2s until done=true (all logs resolved) or maxAttempts reached.
  // Works for both SMS and email by checking both log tables.

  pollSendProgress(
    communicationId: string,
    type: CommunicationType,
    pollIntervalMs = 2000,
    maxAttempts = 60,
  ): Observable<SendProgress> {
    let attempts = 0;

    return interval(pollIntervalMs).pipe(
      startWith(0),
      switchMap(() => from(this.fetchProgress(communicationId, type))),
      takeWhile((progress) => {
        attempts++;
        // Keep polling while not done and under attempt limit
        return !progress.done && attempts < maxAttempts;
      }, true), // emit the final value that fails the predicate
      catchError(() => of({ total: 0, processed: 0, sent: 0, failed: 0, percent: 0, done: true })),
    );
  }

  // Single snapshot for progress bar — call this once after triggering send
  // to get immediate feedback, then switch to pollSendProgress
  getSendProgress(
    communicationId: string,
    type: CommunicationType,
  ): Observable<SendProgress> {
    return from(this.fetchProgress(communicationId, type));
  }

  /**
   * Sends a message AND reports live progress while the server is working.
   * Emits a SendProgress about every second; the last emission has done = true.
   * Errors (plan limit, blocked, failed) are thrown exactly like sendCommunication().
   */
  /**
   * Sends a message with a live progress toast ("Sending… 40%") that turns into a "Done" toast.
   * The send and the toast keep going even if the user leaves the page; pages can also subscribe for the numbers.
   */
  sendWithProgress(communicationId: string, type: CommunicationType, title?: string): Observable<SendProgress> {
    const toastId = `send-${communicationId}`;
    const label = title ? ` “${title.length > 40 ? title.slice(0, 40) + '…' : title}”` : '';
    const out = new ReplaySubject<SendProgress>(1);

    this.toast.progress(toastId, `Sending${label}`, 0, 'Starting…');

    this.sendAndPoll(communicationId, type).subscribe({
      next: (p) => {
        out.next(p);
        if (!p.done) {
          this.toast.progress(toastId, `Sending${label}`, p.percent,
            p.total > 0 ? `${p.processed} of ${p.total} recipient${p.total === 1 ? '' : 's'}` : 'Starting…');
          return;
        }
        if (p.failed === 0) {
          this.toast.finish(toastId, 'success', 'Done — message sent',
            p.sent > 0 ? `Delivered to ${p.sent} recipient${p.sent === 1 ? '' : 's'}.` : undefined);
        } else if (p.sent > 0) {
          this.toast.finish(toastId, 'warning', 'Sent with some failures',
            `${p.sent} delivered, ${p.failed} failed. Check the SMS / email logs for details.`, 9000);
        } else {
          this.toast.finish(toastId, 'error', 'Message could not be delivered',
            `${p.failed} failed. Check the SMS / email logs for the reason.`, 9000);
        }
      },
      error: (e) => {
        this.toast.finish(toastId, 'error', 'Message not sent', e?.message || 'Something went wrong.', 10000);
        out.error(e);
      },
      complete: () => out.complete(),
    });

    return out.asObservable();
  }

  private sendAndPoll(communicationId: string, type: CommunicationType, pollMs = 1000): Observable<SendProgress> {
    return new Observable<SendProgress>((subscriber) => {
      let finished = false;

      const loop = async () => {
        while (!finished) {
          try {
            const p = await this.fetchProgress(communicationId, type);
            // while the server is still working never report "done" and never reach 100%
            if (!finished) subscriber.next({ ...p, done: false, percent: Math.min(p.percent, 99) });
          } catch { /* a missed poll is fine */ }
          await new Promise((r) => setTimeout(r, pollMs));
        }
      };
      loop();

      this.sendCommunication(communicationId).subscribe({
        next: async () => {
          finished = true;
          let last: SendProgress;
          try { last = await this.fetchProgress(communicationId, type); }
          catch { last = { total: 0, processed: 0, sent: 0, failed: 0, percent: 100, done: true }; }
          subscriber.next({ ...last, percent: 100, processed: last.total || last.processed, done: true });
          subscriber.complete();
        },
        error: (e) => { finished = true; subscriber.error(e); },
      });

      return () => { finished = true; };
    });
  }

  private async fetchProgress(
    communicationId: string,
    type: CommunicationType,
  ): Promise<SendProgress> {
    const churchId = this.authService.getChurchId();

    // Status + server-side counters. If the counters don't exist yet (migration not run) fall back to status only.
    let status: string | undefined;
    let sendTotal = 0;
    let sendDone = 0;
    const withCounters = await this.supabase.client
      .from('communications')
      .select('status, send_total, send_done')
      .eq('id', communicationId)
      .single();
    if (!withCounters.error && withCounters.data) {
      status = withCounters.data.status;
      sendTotal = withCounters.data.send_total || 0;
      sendDone = withCounters.data.send_done || 0;
    } else {
      const { data: comm } = await this.supabase.client
        .from('communications').select('status').eq('id', communicationId).single();
      status = comm?.status;
    }
    const isDone = status === 'sent' || status === 'failed';

    // Count logs based on type
    let sent = 0;
    let failed = 0;
    let logRows = 0;

    if (type === 'sms' || type === 'both') {
      const { data: smsData } = await this.supabase.client
        .from('sms_logs')
        .select('status')
        .eq('communication_id', communicationId)
        .eq('church_id', churchId);

      const smsRows = smsData || [];
      sent += smsRows.filter((r) => r.status === 'sent' || r.status === 'delivered').length;
      failed += smsRows.filter((r) => r.status === 'failed').length;
      logRows += smsRows.length;
    }

    if (type === 'email' || type === 'both') {
      const { data: emailData } = await this.supabase.client
        .from('email_logs')
        .select('status')
        .eq('communication_id', communicationId)
        .eq('church_id', churchId);

      const emailRows = emailData || [];
      sent += emailRows.filter((r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'opened').length;
      failed += emailRows.filter((r) => r.status === 'failed').length;
      logRows += emailRows.length;
    }

    // Preferred: the server told us how many recipients there are and how many it has finished.
    // Fallback (older function): count what has been logged, total unknown until finished.
    const total = sendTotal > 0 ? sendTotal : 0;
    const processed = sendTotal > 0 ? Math.min(sendDone, sendTotal) : logRows;
    const percent = total > 0 ? Math.round((processed / total) * 100) : isDone ? 100 : 0;

    return { total, processed, sent, failed, percent, done: isDone };
  }

  // ==================== SMS LOGS ====================

  getSmsLogs(
    page: number = 1,
    pageSize: number = 50,
    filters?: { status?: string; communicationId?: string },
  ): Observable<{ data: SmsLog[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('sms_logs')
          .select(`*, member:members(id, first_name, last_name, phone_primary)`, { count: 'exact' })
          .eq('church_id', churchId);

        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.communicationId) query = query.eq('communication_id', filters.communicationId);

        const { data, error, count } = await query
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as SmsLog[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== EMAIL LOGS ====================

  getEmailLogs(
    page: number = 1,
    pageSize: number = 50,
    filters?: { status?: string; communicationId?: string },
  ): Observable<{ data: EmailLog[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('email_logs')
          .select(`*, member:members(id, first_name, last_name, email)`, { count: 'exact' })
          .eq('church_id', churchId);

        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.communicationId) query = query.eq('communication_id', filters.communicationId);

        const { data, error, count } = await query
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as EmailLog[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== STATISTICS ====================

  getCommunicationStatistics(): Observable<CommunicationStatistics> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    return from(
      (async () => {
        const [
          { count: totalCommunications },
          { count: totalSms },
          { count: totalEmails },
        ] = await Promise.all([
          this.supabase.client
            .from('communications')
            .select('*', { count: 'exact', head: true })
            .eq('church_id', churchId),
          this.supabase.client
            .from('sms_logs')
            .select('*', { count: 'exact', head: true })
            .eq('church_id', churchId),
          this.supabase.client
            .from('email_logs')
            .select('*', { count: 'exact', head: true })
            .eq('church_id', churchId),
        ]);

        let sentQuery = this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('status', 'sent');
        let failedQuery = this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('status', 'failed');
        let pendingQuery = this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .in('status', ['draft', 'scheduled']);

        if (isBranchPastor && branchId) {
          sentQuery = sentQuery.eq('branch_id', branchId);
          failedQuery = failedQuery.eq('branch_id', branchId);
          pendingQuery = pendingQuery.eq('branch_id', branchId);
        }

        const [
          { count: sentCommunications },
          { count: failedCommunications },
          { count: pendingCommunications },
        ] = await Promise.all([sentQuery, failedQuery, pendingQuery]);

        return {
          total_communications: totalCommunications || 0,
          total_sms: totalSms || 0,
          total_emails: totalEmails || 0,
          sent_communications: sentCommunications || 0,
          failed_communications: failedCommunications || 0,
          pending_communications: pendingCommunications || 0,
        };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== HELPERS ====================

  validatePhoneNumber(phone: string): boolean {
    return /^\+?[1-9]\d{1,14}$/.test(phone);
  }

  validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  estimateSmsCount(message: string): number {
    const length = message.length;
    if (length === 0) return 0;
    if (length <= 160) return 1;
    return Math.ceil(length / 153);
  }
}


