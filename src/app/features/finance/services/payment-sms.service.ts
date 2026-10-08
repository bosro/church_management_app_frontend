// src/app/features/finance/services/payment-sms.service.ts
// Sends a short SMS confirmation to a member after a payment is recorded.
// It reuses the existing Communications pipeline (create a 'member' communication,
// then invoke the send-communication edge function), so SMS settings, sender id,
// logging in sms_logs and delivery handling all work exactly as for normal messages.
//
// IMPORTANT: this never throws. A failed SMS must never undo a recorded payment.
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { PermissionService } from '../../../core/services/permission.service';
import { CommunicationsService } from '../../communications/services/communications';

export interface SmsResult {
  sent: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentSmsService {
  private churchName: string | null = null;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private permissions: PermissionService,
    private communications: CommunicationsService,
  ) {}

  /** Same people who may use Communications may send payment alerts. */
  get canSendAlerts(): boolean {
    return this.communications.canManageCommunications() || this.permissions.communications.send;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  sendGivingReceipt(opts: {
    memberId: string;
    firstName: string;
    amount: number;
    currency?: string;
    categoryName?: string;
    date?: string;
  }): Promise<SmsResult> {
    return this.send(opts.memberId, 'Giving received', async () => {
      const church = await this.getChurchName();
      const what = opts.categoryName ? `${opts.categoryName} of` : 'giving of';
      return (
        `Dear ${opts.firstName}, we received your ${what} ` +
        `${this.money(opts.amount, opts.currency)} on ${this.dateText(opts.date)}. ` +
        `Thank you and God bless you.${church ? ' - ' + church : ''}`
      );
    });
  }

  sendPledgePaymentReceipt(opts: {
    memberId: string;
    firstName: string;
    amount: number;
    currency?: string;
    balanceAfter: number; // remaining pledge balance after this payment
    date?: string;
  }): Promise<SmsResult> {
    return this.send(opts.memberId, 'Pledge payment received', async () => {
      const church = await this.getChurchName();
      const balanceText =
        opts.balanceAfter > 0.005
          ? `Remaining balance: ${this.money(opts.balanceAfter, opts.currency)}.`
          : 'Your pledge is now fully paid. Thank you!';
      return (
        `Dear ${opts.firstName}, we received your pledge payment of ` +
        `${this.money(opts.amount, opts.currency)} on ${this.dateText(opts.date)}. ` +
        `${balanceText} God bless you.${church ? ' - ' + church : ''}`
      );
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async send(
    memberId: string,
    title: string,
    buildMessage: () => Promise<string>,
  ): Promise<SmsResult> {
    let communicationId: string | null = null;
    try {
      if (!this.canSendAlerts) {
        return { sent: false, error: 'You do not have permission to send SMS.' };
      }
      const message = await buildMessage();

      const communication = await firstValueFrom(
        this.communications.createCommunication({
          title,
          message,
          communication_type: 'sms',
          target_audience: 'member',
          target_member_id: memberId,
        }),
      );
      communicationId = communication.id;

      await firstValueFrom(this.communications.sendCommunication(communication.id));
      return { sent: true };
    } catch (e: any) {
      // The edge function only says "Send failed" - the real reason (bad number,
      // provider error, no credit...) is written to sms_logs, so look it up.
      const reason = communicationId ? await this.lookupFailureReason(communicationId) : null;
      return { sent: false, error: reason || e?.message || 'SMS could not be sent.' };
    }
  }

  private async lookupFailureReason(communicationId: string): Promise<string | null> {
    try {
      const { data } = await this.supabase.client
        .from('sms_logs')
        .select('error_message')
        .eq('communication_id', communicationId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.error_message || null;
    } catch {
      return null;
    }
  }

  private async getChurchName(): Promise<string> {
    if (this.churchName !== null) return this.churchName;
    try {
      const churchId = this.authService.getChurchId();
      const { data } = await this.supabase.client
        .from('churches')
        .select('name')
        .eq('id', churchId)
        .maybeSingle();
      this.churchName = (data?.name || '').trim().slice(0, 40);
    } catch {
      this.churchName = '';
    }
    return this.churchName ?? '';
  }

  private money(amount: number, currency?: string): string {
    const cur = currency || 'GHS';
    return `${cur} ${Number(amount).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private dateText(date?: string): string {
    const d = date ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : new Date();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
