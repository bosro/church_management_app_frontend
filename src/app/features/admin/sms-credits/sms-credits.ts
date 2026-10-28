// Super-admin page: SMS credits, usage per church, limits and blocking, top-up log.
// Route: /main/admin/sms-credits
import { Component, OnInit } from '@angular/core';
import {
  ProviderBalance,
  SmsChurchDetail,
  SmsChurchRow,
  SmsCreditsService,
  SmsOverview,
  SmsTopup,
} from '../../../core/services/sms-credits.service';

type Tab = 'churches' | 'topups';
type StatusFilter = 'all' | 'attention' | 'blocked';
type Health = 'blocked' | 'reached' | 'near' | 'ok' | 'unlimited';

@Component({
  selector: 'app-sms-credits',
  standalone: false,
  templateUrl: './sms-credits.html',
  styleUrl: './sms-credits.scss',
})
export class SmsCredits implements OnInit {
  tab: Tab = 'churches';
  loading = true;
  working = false;
  errorMessage = '';
  successMessage = '';

  month = ''; // 'YYYY-MM'; empty = this month
  search = '';
  statusFilter: StatusFilter = 'all';
  overview: SmsOverview | null = null;

  // provider balance
  balance: ProviderBalance | null = null;
  balanceLoading = false;
  showRaw = false;
  threshold = 500;
  thresholdEdit = 500;

  // limit / block dialog
  ctl: SmsChurchRow | null = null;
  ctlCap: number | null = null;
  ctlLimitMode: 'plan' | 'custom' = 'plan';
  ctlBlocked = false;
  ctlReason = '';
  ctlNotes = '';

  // detail dialog
  detailRow: SmsChurchRow | null = null;
  detail: SmsChurchDetail | null = null;
  detailLoading = false;

  // top-ups
  topups: SmsTopup[] = [];
  topupForm = this.emptyTopup();

  constructor(private svc: SmsCreditsService) {}

  async ngOnInit(): Promise<void> {
    this.svc.getLowBalanceThreshold().then((n) => (this.threshold = this.thresholdEdit = n));
    await Promise.all([this.load(), this.refreshBalance()]);
  }

  // ── data ────────────────────────────────────────────────────
  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.overview = await this.svc.getOverview(this.month);
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.loading = false;
    }
  }

  async refreshBalance(): Promise<void> {
    this.balanceLoading = true;
    try {
      this.balance = await this.svc.getProviderBalance();
    } finally {
      this.balanceLoading = false;
    }
  }

  async setTab(t: Tab): Promise<void> {
    this.tab = t;
    if (t === 'topups') await this.loadTopups();
  }

  async loadTopups(): Promise<void> {
    try {
      this.topups = await this.svc.listTopups();
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    }
  }

  // ── derived ─────────────────────────────────────────────────
  health(r: SmsChurchRow): Health {
    if (r.blocked) return 'blocked';
    if (r.limit === null || r.limit === undefined) return 'unlimited';
    if (r.limit === 0 || r.used >= r.limit) return 'reached';
    if (r.used >= r.limit * 0.8) return 'near';
    return 'ok';
  }

  healthLabel(h: Health): string {
    return { blocked: 'Blocked', reached: 'Limit reached', near: 'Near limit', ok: 'OK', unlimited: 'Unlimited' }[h];
  }

  pct(r: SmsChurchRow): number {
    if (!r.limit) return r.used > 0 ? 100 : 0;
    return Math.min(100, Math.round((r.used / r.limit) * 100));
  }

  get rows(): SmsChurchRow[] {
    const q = this.search.trim().toLowerCase();
    return (this.overview?.churches || []).filter((r) => {
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      const h = this.health(r);
      if (this.statusFilter === 'blocked') return h === 'blocked';
      if (this.statusFilter === 'attention') return h === 'blocked' || h === 'reached' || h === 'near';
      return true;
    });
  }

  get attentionCount(): number {
    return (this.overview?.churches || []).filter((r) => ['blocked', 'reached', 'near'].includes(this.health(r))).length;
  }

  /** What the credit ledger says is left: everything topped up minus everything sent. A cross-check only. */
  get ledgerRemaining(): number | null {
    const t = this.overview?.totals;
    if (!t || !t.topped_up_all_time) return null;
    return t.topped_up_all_time - t.sent_all_time;
  }

  get lowBalance(): boolean {
    return typeof this.balance?.balance === 'number' && this.balance.balance < this.threshold;
  }

  get monthLabel(): string {
    const d = this.overview?.totals?.month_start ? new Date(this.overview.totals.month_start) : new Date();
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  // ── threshold ───────────────────────────────────────────────
  async saveThreshold(): Promise<void> {
    const n = Math.floor(Number(this.thresholdEdit));
    if (!Number.isFinite(n) || n < 1) return;
    try {
      await this.svc.setLowBalanceThreshold(n);
      this.threshold = n;
      this.flash('Low-balance warning updated.');
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    }
  }

  // ── limit / block dialog ────────────────────────────────────
  openControl(r: SmsChurchRow, quickBlock?: boolean): void {
    this.ctl = r;
    this.ctlLimitMode = r.cap !== null && r.cap !== undefined ? 'custom' : 'plan';
    this.ctlCap = r.cap ?? r.limit ?? 100;
    this.ctlBlocked = quickBlock !== undefined ? quickBlock : r.blocked;
    this.ctlReason = r.block_reason || '';
    this.ctlNotes = r.notes || '';
    this.errorMessage = '';
  }

  closeControl(): void {
    if (!this.working) this.ctl = null;
  }

  get ctlValid(): boolean {
    if (this.ctlLimitMode === 'custom') {
      const n = Number(this.ctlCap);
      if (!Number.isInteger(n) || n < 0) return false;
    }
    return true;
  }

  async saveControl(): Promise<void> {
    if (!this.ctl || !this.ctlValid || this.working) return;
    this.working = true;
    try {
      const cap = this.ctlLimitMode === 'custom' ? Number(this.ctlCap) : null;
      await this.svc.setControl(
        this.ctl.church_id,
        cap,
        this.ctlBlocked,
        this.ctlBlocked ? this.ctlReason.trim() || null : null,
        this.ctlNotes.trim() || null,
      );
      const name = this.ctl.name;
      this.ctl = null;
      this.flash(`Saved SMS settings for ${name}.`);
      await this.load();
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.working = false;
    }
  }

  // ── detail dialog ───────────────────────────────────────────
  async openDetail(r: SmsChurchRow): Promise<void> {
    this.detailRow = r;
    this.detail = null;
    this.detailLoading = true;
    try {
      this.detail = await this.svc.getChurchDetail(r.church_id, this.month);
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
      this.detailRow = null;
    } finally {
      this.detailLoading = false;
    }
  }

  // ── top-ups ─────────────────────────────────────────────────
  private emptyTopup() {
    return { credits: null as number | null, amount_paid: null as number | null, reference: '', note: '', topped_up_on: new Date().toISOString().slice(0, 10) };
  }

  get topupValid(): boolean {
    return Number.isInteger(Number(this.topupForm.credits)) && Number(this.topupForm.credits) > 0;
  }

  async addTopup(): Promise<void> {
    if (!this.topupValid || this.working) return;
    this.working = true;
    try {
      await this.svc.addTopup({
        credits: Number(this.topupForm.credits),
        amount_paid: this.topupForm.amount_paid === null || this.topupForm.amount_paid === ('' as any) ? null : Number(this.topupForm.amount_paid),
        reference: this.topupForm.reference?.trim() || null,
        note: this.topupForm.note?.trim() || null,
        topped_up_on: this.topupForm.topped_up_on,
      });
      this.topupForm = this.emptyTopup();
      this.flash('Top-up recorded.');
      await Promise.all([this.loadTopups(), this.load()]);
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.working = false;
    }
  }

  async deleteTopup(t: SmsTopup): Promise<void> {
    if (!confirm(`Delete the top-up of ${t.credits.toLocaleString()} credits?`)) return;
    try {
      await this.svc.deleteTopup(t.id);
      await Promise.all([this.loadTopups(), this.load()]);
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    }
  }

  // ── helpers ─────────────────────────────────────────────────
  private friendly(e: any): string {
    const m = e?.message || 'Something went wrong.';
    if (/admin_sms_overview|church_sms_controls|sms_topups|admin_set_sms_control/i.test(m) && /not exist|could not find/i.test(m)) {
      return 'The SMS credits database migration has not been run yet (20261029_sms_credits.sql).';
    }
    return m;
  }

  private flash(m: string): void {
    this.successMessage = m;
    setTimeout(() => (this.successMessage = ''), 5000);
  }
}
