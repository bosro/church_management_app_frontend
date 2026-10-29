// Super-admin page: review SMS sender ID requests.
// Route: /main/admin/sender-id-requests
import { Component, OnInit } from '@angular/core';
import {
  AdminSenderIdRow,
  ProviderSender,
  ReviewAction,
  SenderIdRequest,
  SenderIdService,
  SenderRequestStatus,
} from '../../../core/services/sender-id.service';

type Filter = 'open' | 'approved' | 'rejected' | 'all' | 'ids';

@Component({
  selector: 'app-sender-id-requests',
  standalone: false,
  templateUrl: './sender-id-requests.html',
  styleUrl: './sender-id-requests.scss',
})
export class SenderIdRequestsPage implements OnInit {
  loading = true;
  working = false;
  errorMessage = '';
  successMessage = '';

  filter: Filter = 'open';
  requests: SenderIdRequest[] = [];
  openCount = 0;

  // GiantSMS status of each name (looked up live from the provider)
  providerMap = new Map<string, ProviderSender>();
  providerLoaded = false;
  providerError = '';
  autoGrant = true;

  // every sender ID of every church
  allIds: AdminSenderIdRow[] = [];

  // dialog state
  dialog: { req: SenderIdRequest; action: ReviewAction } | null = null;
  reason = '';
  adminNotes = '';

  constructor(private svc: SenderIdService) {}

  ngOnInit(): void {
    this.load();
    this.refreshProvider();
    this.svc.getAutoGrant().then((v) => (this.autoGrant = v)).catch(() => {});
  }

  async refreshProvider(): Promise<void> {
    this.providerError = '';
    const r = await this.svc.getProviderSenders();
    this.providerLoaded = !!r.senders;
    this.providerError = r.error || '';
    this.providerMap = new Map((r.senders || []).map((x) => [x.name.toLowerCase(), x]));
  }

  /** approved / pending / declined at GiantSMS, 'not_registered' if GiantSMS doesn't know the name, null if unknown */
  providerStatus(r: SenderIdRequest): string | null {
    if (!this.providerLoaded) return null;
    return this.providerMap.get(r.requested_sender_id.toLowerCase())?.status ?? 'not_registered';
  }

  providerLabel(st: string | null): string {
    return ({ approved: 'Approved at GiantSMS', pending: 'Pending at GiantSMS', declined: 'Declined by GiantSMS', not_registered: 'Not registered at GiantSMS' } as Record<string, string>)[st || ''] || '';
  }

  async registerAtProvider(r: SenderIdRequest): Promise<void> {
    if (this.working) return;
    this.working = true;
    this.errorMessage = '';
    try {
      const msg = await this.svc.registerAtProvider(r.id);
      this.flash(`Sent to GiantSMS: ${msg}`);
      await this.refreshProvider();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not register at GiantSMS.';
    } finally {
      this.working = false;
    }
  }

  async toggleAutoGrant(): Promise<void> {
    const next = !this.autoGrant;
    try {
      await this.svc.setAutoGrant(next);
      this.autoGrant = next;
      this.flash(next ? 'Names already approved at GiantSMS are now granted automatically.' : 'Every new sender ID now waits for your approval.');
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not change the setting.';
    }
  }

  async toggleActive(row: AdminSenderIdRow): Promise<void> {
    const to = !row.is_active;
    if (!to && !confirm(`Switch off “${row.sender_id}” for ${row.church_name}? They will no longer be able to send with it.`)) return;
    try {
      await this.svc.setSenderIdActive(row.id, to);
      this.flash(`“${row.sender_id}” is ${to ? 'on' : 'off'} for ${row.church_name}.`);
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not update.';
    }
  }

  /** Warn when approving a name that GiantSMS has not approved yet */
  get approveWarning(): string {
    if (this.dialog?.action !== 'approve') return '';
    const st = this.providerStatus(this.dialog.req);
    if (st === null || st === 'approved') return '';
    return `GiantSMS shows this name as “${this.providerLabel(st).replace(' at GiantSMS', '').replace(' by GiantSMS', '').toLowerCase()}”. Messages sent with it may fail until GiantSMS approves it.`;
  }

  async setFilter(f: Filter): Promise<void> {
    this.filter = f;
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      if (this.filter === 'ids') {
        this.allIds = await this.svc.listAllSenderIds();
        return;
      }
      const [list, count] = await Promise.all([
        this.svc.listRequests(this.filter === 'all' ? undefined : this.filter),
        this.svc.countOpen().catch(() => 0),
      ]);
      this.requests = list;
      this.openCount = count;
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not load requests.';
    } finally {
      this.loading = false;
    }
  }

  isOpen(r: SenderIdRequest): boolean {
    return r.status === 'pending' || r.status === 'processing';
  }

  open(req: SenderIdRequest, action: ReviewAction): void {
    this.dialog = { req, action };
    this.reason = '';
    this.adminNotes = req.admin_notes || '';
    this.errorMessage = '';
  }

  closeDialog(): void {
    if (this.working) return;
    this.dialog = null;
  }

  get dialogTitle(): string {
    if (!this.dialog) return '';
    const id = this.dialog.req.requested_sender_id;
    return {
      processing: `Mark “${id}” as in progress`,
      approve: `Approve “${id}”`,
      reject: `Reject “${id}”`,
    }[this.dialog.action];
  }

  get canConfirm(): boolean {
    if (!this.dialog || this.working) return false;
    return this.dialog.action !== 'reject' || this.reason.trim().length >= 3;
  }

  async confirm(): Promise<void> {
    if (!this.dialog || !this.canConfirm) return;
    const { req, action } = this.dialog;
    this.working = true;
    this.errorMessage = '';
    try {
      await this.svc.review(
        req.id,
        action,
        action === 'reject' ? this.reason.trim() : undefined,
        this.adminNotes.trim() || undefined,
      );
      this.dialog = null;
      this.flash(
        action === 'approve'
          ? `“${req.requested_sender_id}” is now live for ${req.church?.name}.`
          : action === 'reject'
            ? 'Request rejected and the church was notified.'
            : 'Marked as in progress.',
      );
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Action failed.';
    } finally {
      this.working = false;
    }
  }

  statusLabel(s: SenderRequestStatus): string {
    return { pending: 'New', processing: 'In progress', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }[s];
  }

  private flash(m: string): void {
    this.successMessage = m;
    setTimeout(() => (this.successMessage = ''), 6000);
  }
}
