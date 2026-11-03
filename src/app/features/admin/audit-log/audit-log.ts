// Super-admin page: Audit Log. Route: /main/admin/audit-log
import { Component, OnInit } from '@angular/core';
import { AuditFilters, AuditLogService, AuditRow } from '../../../core/services/audit-log.service';

const TABLE_LABELS: Record<string, string> = {
  churches: 'Church', profiles: 'User', members: 'Member', branches: 'Branch', events: 'Event',
  ministries: 'Ministry', sermons: 'Sermon', custom_forms: 'Form', attendance_events: 'Attendance event',
  giving_transactions: 'Giving payment', giving_categories: 'Giving category', payment_links: 'Payment link',
  building_commitments: 'Building commitment', pledges: 'Pledge', withdrawal_requests: 'Withdrawal',
  church_sender_ids: 'Sender ID', sms_sender_id_requests: 'Sender ID request', church_sms_controls: 'SMS limit / block',
  sms_topups: 'SMS top-up', platform_settings: 'Platform setting', subscription_plans: 'Subscription plan',
};

@Component({
  selector: 'app-audit-log',
  standalone: false,
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.scss',
})
export class AuditLog implements OnInit {
  readonly pageSize = 50;
  filters: AuditFilters = { churchId: '', table: '', action: '' };
  tables: string[] = [];
  churches: { id: string; name: string }[] = [];

  rows: AuditRow[] = [];
  total = 0;
  page = 0;
  loading = true;
  errorMessage = '';
  open = new Set<string>();

  constructor(private svc: AuditLogService) {}

  async ngOnInit(): Promise<void> {
    this.svc.getTables().then((t) => (this.tables = t)).catch(() => {});
    this.svc.getChurches().then((c) => (this.churches = c)).catch(() => {});
    await this.load();
  }

  async load(resetPage = false): Promise<void> {
    if (resetPage) this.page = 0;
    this.loading = true;
    this.errorMessage = '';
    this.open.clear();
    try {
      const res = await this.svc.getPage(this.filters, this.pageSize, this.page * this.pageSize);
      this.rows = res.rows || [];
      this.total = res.total || 0;
    } catch (e: any) {
      this.rows = [];
      this.total = 0;
      this.errorMessage = /admin_audit_logs/i.test(e?.message || '') && /not exist|could not find/i.test(e?.message || '')
        ? 'The audit log database migration has not been run yet (20261103_audit_log_and_suspension.sql).'
        : e?.message || 'Could not load the audit log.';
    } finally {
      this.loading = false;
    }
  }

  clear(): void {
    this.filters = { churchId: '', table: '', action: '' };
    this.load(true);
  }

  get pages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get rangeText(): string {
    if (!this.total) return '0';
    const a = this.page * this.pageSize + 1;
    return `${a}–${Math.min(this.total, a + this.rows.length - 1)} of ${this.total.toLocaleString()}`;
  }

  async go(delta: number): Promise<void> {
    const next = this.page + delta;
    if (next < 0 || next >= this.pages) return;
    this.page = next;
    await this.load();
  }

  /** Names are looked up defensively: rows written by the app itself (not a database trigger) can lack a table name. */
  tableLabel(t: string | null | undefined): string {
    if (!t) return 'Other activity';
    return TABLE_LABELS[t] || String(t).replace(/_/g, ' ');
  }

  actionLabel(a: string | null | undefined): string {
    if (a === 'INSERT') return 'Created';
    if (a === 'UPDATE') return 'Changed';
    if (a === 'DELETE') return 'Deleted';
    if (!a) return 'Event';
    const x = String(a).toLowerCase().replace(/_/g, ' ');
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  /** CSS class for the action chip (unknown actions get a neutral one) */
  actionClass(a: string | null | undefined): string {
    return a === 'INSERT' || a === 'UPDATE' || a === 'DELETE' ? a : 'OTHER';
  }

  who(r: AuditRow): string {
    return r.user_name || (r.user_id ? 'Unknown user' : 'System / automatic');
  }

  /** one-line summary shown in the table — never throws, whatever the row looks like */
  summary(r: AuditRow): string {
    try {
      if (r.action === 'UPDATE' && r.changes && typeof r.changes === 'object') {
        const keys = Object.keys(r.changes);
        if (!keys.length) return 'No visible changes';
        const shown = keys.slice(0, 4).map((k) => k.replace(/_/g, ' ')).join(', ');
        return keys.length > 4 ? `${shown} +${keys.length - 4} more` : shown;
      }
      const d = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : {};
      const pick = (...ks: string[]): string => {
        for (const k of ks) {
          const v = d[k];
          if (typeof v === 'string' || typeof v === 'number') return String(v);
        }
        return '';
      };
      const name = pick('name', 'title', 'full_name', 'first_name', 'sender_id', 'requested_sender_id', 'key');
      const last = pick('last_name');
      return `${name} ${last}`.trim();
    } catch {
      return '';
    }
  }

  toggle(id: string): void {
    if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
  }

  changeEntries(r: AuditRow): { field: string; from: string; to: string }[] {
    if (!r.changes || typeof r.changes !== 'object') return [];
    return Object.entries(r.changes).map(([field, v]) => ({
      field: field.replace(/_/g, ' '), from: this.fmt(v?.from), to: this.fmt(v?.to),
    }));
  }

  dataEntries(r: AuditRow): { field: string; value: string }[] {
    const d = r.data;
    if (d === null || d === undefined) return [];
    if (typeof d !== 'object' || Array.isArray(d)) return [{ field: 'details', value: this.fmt(d) }];
    return Object.entries(d)
      .filter(([, v]) => v !== null && v !== '' && v !== undefined)
      .map(([field, v]) => ({ field: field.replace(/_/g, ' '), value: this.fmt(v) }));
  }

  private fmt(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    let s: string;
    try { s = typeof v === 'object' ? JSON.stringify(v) : String(v); } catch { s = '[unreadable]'; }
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  }
}
