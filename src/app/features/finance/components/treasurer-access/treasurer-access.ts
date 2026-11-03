// Church admin / finance officer: set up the Treasurer Service Entry link.
// Route: /main/finance/treasurer-access
import { Component, OnInit } from '@angular/core';
import { copyToClipboard } from '../../../../core/utils/copy-to-clipboard';
import { AuthService } from '../../../../core/services/auth';
import { TreasurerAdminService, TreasurerEntryRow, TreasurerSettings } from '../../../../core/services/treasurer-admin.service';

@Component({
  selector: 'app-treasurer-access',
  standalone: false,
  templateUrl: './treasurer-access.html',
  styleUrl: './treasurer-access.scss',
})
export class TreasurerAccess implements OnInit {
  loading = true;
  working = false;
  errorMessage = '';
  successMessage = '';

  settings: TreasurerSettings | null = null;
  enabled = false;
  maxBackdateDays = 14;
  maxAmount = 50000;
  undoMinutes = 15;
  newPin = '';
  showQr = false;
  copied = false;

  from = '';
  to = '';
  entries: { total: number; count: number; rows: TreasurerEntryRow[] } | null = null;
  loadingEntries = false;

  constructor(private svc: TreasurerAdminService, private auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    this.to = fmt(t);
    const f = new Date(t); f.setDate(f.getDate() - 7);
    this.from = fmt(f);
    await this.load();
    await this.loadEntries();
  }

  /** the link the treasurer opens on a phone or tablet */
  get link(): string {
    const id = this.settings?.church_id || this.auth.getChurchId();
    return `${window.location.origin}/public/treasurer/${id}`;
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.settings = await this.svc.getSettings();
      this.enabled = this.settings.is_enabled;
      this.maxBackdateDays = this.settings.max_backdate_days;
      this.maxAmount = Number(this.settings.max_amount);
      this.undoMinutes = this.settings.undo_minutes;
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.loading = false;
    }
  }

  async loadEntries(): Promise<void> {
    this.loadingEntries = true;
    try {
      this.entries = await this.svc.entries(this.from, this.to);
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.loadingEntries = false;
    }
  }

  // ── PIN ─────────────────────────────────────────────────────
  get pinValid(): boolean { return /^[0-9]{4,8}$/.test(this.newPin); }

  async savePin(): Promise<void> {
    if (!this.pinValid || this.working) return;
    this.working = true;
    this.errorMessage = '';
    try {
      await this.svc.setPin(this.newPin);
      this.newPin = '';
      this.flash('PIN saved. Anyone signed in with the old PIN has been signed out.');
      await this.load();
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.working = false;
    }
  }

  // ── on/off + limits ─────────────────────────────────────────
  get settingsValid(): boolean {
    return this.maxBackdateDays >= 0 && this.maxBackdateDays <= 90 && this.maxAmount > 0 && this.undoMinutes >= 0 && this.undoMinutes <= 120;
  }

  async saveSettings(): Promise<void> {
    if (!this.settingsValid || this.working) return;
    this.working = true;
    this.errorMessage = '';
    try {
      await this.svc.saveSettings({
        enabled: this.enabled, maxBackdateDays: Number(this.maxBackdateDays), maxAmount: Number(this.maxAmount), undoMinutes: Number(this.undoMinutes),
      });
      this.flash(this.enabled ? 'Saved. The link is ON.' : 'Saved. The link is OFF.');
      await this.load();
    } catch (e: any) {
      this.enabled = this.settings?.is_enabled ?? false;
      this.errorMessage = this.friendly(e);
    } finally {
      this.working = false;
    }
  }

  async toggleEnabled(): Promise<void> {
    this.enabled = !this.enabled;
    await this.saveSettings();
  }

  async signEveryoneOut(): Promise<void> {
    if (!confirm('Sign everyone out of Service Entry now? They will need the PIN again.')) return;
    this.working = true;
    try {
      const n = await this.svc.revokeSessions();
      this.flash(n ? `Signed out ${n} session(s).` : 'Nobody was signed in.');
      await this.load();
    } catch (e: any) {
      this.errorMessage = this.friendly(e);
    } finally {
      this.working = false;
    }
  }

  // ── sharing ─────────────────────────────────────────────────
  async copy(): Promise<void> {
    this.copied = await copyToClipboard(this.link);
    if (this.copied) setTimeout(() => (this.copied = false), 2500);
  }

  // ── entries ─────────────────────────────────────────────────
  methodLabel(m: string | null): string {
    return ({ cash: 'Cash', mobile_money: 'Mobile Money', bank_transfer: 'Bank Transfer', check: 'Cheque', card: 'Card' } as Record<string, string>)[m || ''] || (m || '');
  }

  exportCsv(): void {
    const rows = this.entries?.rows || [];
    if (!rows.length) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Receipt', 'Who', 'Category', 'Amount', 'Method', 'Recorded by'];
    const lines = rows.map((r) => [r.date, r.receipt, r.who, r.category, r.amount, this.methodLabel(r.method), r.recorder || (r.via === 'treasurer_staff' ? 'Staff (signed in)' : '')].map(esc).join(','));
    const blob = new Blob(['\ufeff' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `service-entries-${this.from}-to-${this.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private friendly(e: any): string {
    const m = e?.message || 'Something went wrong.';
    if (/treasurer_(get_settings|admin_entries)/i.test(m) && /not exist|could not find/i.test(m)) {
      return 'The Service Entry database migration has not been run yet (20261107_treasurer_service_entry.sql).';
    }
    return m;
  }

  private flash(m: string): void {
    this.successMessage = m;
    setTimeout(() => (this.successMessage = ''), 5000);
  }
}
