// Super-admin page: review SMS sender ID requests.
// Route: /main/admin/sender-id-requests
import { Component, OnInit } from '@angular/core';
import {
  AdminSenderIdRow,
  ChurchPick,
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


  // rename / move / edit dialog
  fix: { kind: 'id' | 'request'; id: string; label: string; name: string; churchId: string; currentChurchId: string } | null = null;
  churches: ChurchPick[] = [];
  lookupEmail = '';
  lookupMsg = '';

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


  // ── fix-up tools ──────────────────────────────────────────
  async openFixId(row: AdminSenderIdRow): Promise<void> {
    await this.ensureChurches();
    this.fix = { kind: 'id', id: row.id, label: `${row.sender_id} (${row.church_name})`, name: row.sender_id, churchId: row.church_id, currentChurchId: row.church_id };
    this.lookupEmail = ''; this.lookupMsg = '';
  }

  async openFixRequest(r: SenderIdRequest): Promise<void> {
    await this.ensureChurches();
    this.fix = { kind: 'request', id: r.id, label: `${r.requested_sender_id} (${r.church?.name?.trim() || 'church'})`, name: r.requested_sender_id, churchId: r.church_id, currentChurchId: r.church_id };
    this.lookupEmail = ''; this.lookupMsg = '';
  }

  private async ensureChurches(): Promise<void> {
    if (this.churches.length) return;
    try { this.churches = await this.svc.listChurchesForPicker(); }
    catch (e: any) { this.errorMessage = e?.message || 'Could not load churches.'; }
  }

  churchLabel(c: ChurchPick): string {
    return c.emails.length ? `${c.name} — ${c.emails[0]}` : c.name;
  }

  async findByEmail(): Promise<void> {
    if (!this.fix) return;
    const email = this.lookupEmail.trim();
    if (!email) return;
    this.lookupMsg = '';
    let id = await this.svc.churchIdForUserEmail(email).catch(() => null);
    if (!id) id = this.churches.find((c) => c.emails.some((e) => e.toLowerCase() === email.toLowerCase()))?.id ?? null;
    if (id) {
      this.fix.churchId = id;
      this.lookupMsg = `Found: ${this.churches.find((c) => c.id === id)?.name || 'church'}`;
    } else {
      this.lookupMsg = 'No church found for that email.';
    }
  }

  get fixChanged(): boolean {
    return !!this.fix && (this.fix.churchId !== this.fix.currentChurchId || this.fix.name.trim() !== this.fixOriginalName);
  }

  private get fixOriginalName(): string {
    if (!this.fix) return '';
    return this.fix.label.split(' (')[0];
  }

  closeFix(): void { if (!this.working) this.fix = null; }

  async saveFix(): Promise<void> {
    if (!this.fix || this.working || !this.fixChanged) return;
    this.working = true;
    this.errorMessage = '';
    const f = this.fix;
    try {
      const nameChanged = f.name.trim() !== this.fixOriginalName;
      const churchChanged = f.churchId !== f.currentChurchId;
      if (f.kind === 'id') {
        if (nameChanged) await this.svc.renameSenderId(f.id, f.name.trim());
        if (churchChanged) await this.svc.moveSenderId(f.id, f.churchId);
      } else {
        await this.svc.editOpenRequest(f.id, nameChanged ? f.name.trim() : null, churchChanged ? f.churchId : null);
      }
      const to = this.churches.find((c) => c.id === f.churchId)?.name;
      this.fix = null;
      this.flash(churchChanged ? `Saved. “${f.name.trim()}” now belongs to ${to}.` : `Saved. Renamed to “${f.name.trim()}”.`);
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not save.';
    } finally {
      this.working = false;
    }
  }

  /** Make every saved name use exactly the capital letters GiantSMS shows. */
  async matchCasing(): Promise<void> {
    if (this.working) return;
    if (!this.providerLoaded) { this.errorMessage = 'GiantSMS names are not loaded. Press “Refresh GiantSMS status” first.'; return; }
    this.working = true;
    this.errorMessage = '';
    try {
      const changed = await this.svc.syncCasing([...this.providerMap.values()].map((s) => s.name));
      this.flash(changed.length
        ? `Updated ${changed.length}: ${changed.map((c) => `${c.from} → ${c.to}`).join(', ')}`
        : 'Everything already matches GiantSMS.');
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not match names.';
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
