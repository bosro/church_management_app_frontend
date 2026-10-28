// Super-admin page: review SMS sender ID requests.
// Route: /main/admin/sender-id-requests
import { Component, OnInit } from '@angular/core';
import {
  ReviewAction,
  SenderIdRequest,
  SenderIdService,
  SenderRequestStatus,
} from '../../../core/services/sender-id.service';

type Filter = 'open' | 'approved' | 'rejected' | 'all';

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

  // dialog state
  dialog: { req: SenderIdRequest; action: ReviewAction } | null = null;
  reason = '';
  adminNotes = '';

  constructor(private svc: SenderIdService) {}

  ngOnInit(): void {
    this.load();
  }

  async setFilter(f: Filter): Promise<void> {
    this.filter = f;
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
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
