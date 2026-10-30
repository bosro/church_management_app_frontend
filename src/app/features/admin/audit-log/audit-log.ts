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
  filters: AuditFilters = {};
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
    this.filters = {};
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

  tableLabel(t: string): string { return TABLE_LABELS[t] || t.replace(/_/g, ' '); }

  actionLabel(a: string): string {
    return a === 'INSERT' ? 'Created' : a === 'UPDATE' ? 'Changed' : a === 'DELETE' ? 'Deleted' : a;
  }

  who(r: AuditRow): string {
    return r.user_name || (r.user_id ? 'Unknown user' : 'System / automatic');
  }

  /** one-line summary shown in the table */
  summary(r: AuditRow): string {
    if (r.action === 'UPDATE' && r.changes) {
      const keys = Object.keys(r.changes);
      if (!keys.length) return 'No visible changes';
      const shown = keys.slice(0, 4).map((k) => k.replace(/_/g, ' ')).join(', ');
      return keys.length > 4 ? `${shown} +${keys.length - 4} more` : shown;
    }
    const d = r.data || {};
    const name = (d['name'] ?? d['title'] ?? d['full_name'] ?? d['first_name'] ?? d['sender_id'] ?? d['requested_sender_id'] ?? d['key'] ?? '') as string;
    const last = (d['last_name'] ?? '') as string;
    return `${name} ${last}`.trim();
  }

  toggle(id: string): void {
    if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
  }

  changeEntries(r: AuditRow): { field: string; from: string; to: string }[] {
    return Object.entries(r.changes || {}).map(([field, v]) => ({ field: field.replace(/_/g, ' '), from: this.fmt(v.from), to: this.fmt(v.to) }));
  }

  dataEntries(r: AuditRow): { field: string; value: string }[] {
    return Object.entries(r.data || {})
      .filter(([, v]) => v !== null && v !== '' && v !== undefined)
      .map(([field, v]) => ({ field: field.replace(/_/g, ' '), value: this.fmt(v) }));
  }

  private fmt(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  }
}
