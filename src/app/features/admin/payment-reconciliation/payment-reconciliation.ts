// Super-admin page: Payment Check. Route: /main/admin/payment-reconciliation
import { Component, OnInit } from '@angular/core';
import {
  CheckResult,
  PaymentReconciliationService,
  PendingPayment,
  WebhookProblem,
} from '../../../core/services/payment-reconciliation.service';

@Component({
  selector: 'app-payment-reconciliation',
  standalone: false,
  templateUrl: './payment-reconciliation.html',
  styleUrl: './payment-reconciliation.scss',
})
export class PaymentReconciliation implements OnInit {
  minAge = 60; // minutes
  ageOptions = [
    { v: 10, l: '10 minutes' },
    { v: 60, l: '1 hour' },
    { v: 1440, l: '1 day' },
    { v: 10080, l: '7 days' },
    { v: 0, l: 'Any age' },
  ];

  rows: PendingPayment[] = [];
  total = 0;
  totalAmount = 0;
  loading = true;
  checking = false;
  errorMessage = '';
  infoMessage = '';

  selected = new Set<string>();
  results = new Map<string, CheckResult>();
  checkingId: string | null = null;

  problems: WebhookProblem[] = [];
  showProblems = false;

  constructor(private svc: PaymentReconciliationService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    this.svc.getWebhookProblems().then((p) => (this.problems = p)).catch(() => {});
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const res = await this.svc.getPending(this.minAge);
      this.rows = res.rows || [];
      this.total = res.total || 0;
      this.totalAmount = Number(res.total_amount) || 0;
      this.selected.clear();
    } catch (e: any) {
      this.rows = [];
      this.errorMessage = /admin_list_pending_payments/i.test(e?.message || '') && /not exist|could not find/i.test(e?.message || '')
        ? 'The payment check database migration has not been run yet (20261106_payment_reconciliation.sql).'
        : e?.message || 'Could not load pending payments.';
    } finally {
      this.loading = false;
    }
  }

  // ── selection ───────────────────────────────────────────────
  toggle(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
  }
  get allSelected(): boolean { return !!this.rows.length && this.rows.every((r) => this.selected.has(r.id)); }
  toggleAll(): void {
    if (this.allSelected) this.selected.clear(); else this.rows.forEach((r) => this.selected.add(r.id));
  }

  // ── checking with Paystack ──────────────────────────────────
  async checkOne(r: PendingPayment): Promise<void> {
    this.checkingId = r.id;
    await this.run([r.id]);
    this.checkingId = null;
  }

  async checkSelected(): Promise<void> {
    await this.run([...this.selected].slice(0, 50));
  }

  async checkShown(): Promise<void> {
    await this.run(this.rows.slice(0, 50).map((r) => r.id));
  }

  private async run(ids: string[]): Promise<void> {
    if (!ids.length || this.checking) return;
    this.checking = true;
    this.errorMessage = '';
    this.infoMessage = '';
    try {
      const out = await this.svc.check(ids, this.minAge === 0 ? 0 : Math.min(this.minAge, 10));
      out.results.forEach((r) => this.results.set(r.id, r));
      const s = out.summary;
      const parts = [
        s['completed'] && `${s['completed']} confirmed and completed`,
        s['abandoned'] && `${s['abandoned']} abandoned`,
        s['failed'] && `${s['failed']} failed`,
        s['still_pending'] && `${s['still_pending']} still pending`,
        s['needs_review'] && `${s['needs_review']} need your review`,
        s['already_done'] && `${s['already_done']} were already done`,
        s['error'] && `${s['error']} could not be checked`,
      ].filter(Boolean);
      this.infoMessage = out.results.length
        ? `Checked ${out.results.length} with Paystack: ${parts.join(', ')}.`
        : 'Nothing to check.';
      // refresh the list but keep the results shown next to each row
      const keep = new Map(this.results);
      await this.load();
      this.results = keep;
    } catch (e: any) {
      this.errorMessage = /paystack-reconcile|non-2xx|FunctionsHttpError/i.test(e?.message || '')
        ? 'The paystack-reconcile edge function is not deployed yet (or is failing). Deploy it and try again.'
        : e?.message || 'Check failed.';
    } finally {
      this.checking = false;
    }
  }

  // ── display helpers ─────────────────────────────────────────
  age(mins: number): string {
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.floor(mins / 60)} h`;
    return `${Math.floor(mins / 1440)} d`;
  }

  outcomeLabel(o: string): string {
    return ({
      completed: 'Completed', failed: 'Failed', abandoned: 'Abandoned', still_pending: 'Still pending',
      needs_review: 'Needs review', already_done: 'Already done', error: 'Could not check',
    } as Record<string, string>)[o] || o;
  }

  trackById(_: number, r: { id: string }): string { return r.id; }
}
