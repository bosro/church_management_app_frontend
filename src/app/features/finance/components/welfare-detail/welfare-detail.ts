

// src/app/features/finance/components/welfare-detail/welfare-detail.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { WelfareService, WelfareRow, WelfareSettings } from './../../services/welfare.service';
import { FinanceService } from '../../services/finance.service';
import { PermissionService } from '../../../../core/services/permission.service';

interface MonthLine {
  label: string;
  state: 'covered' | 'part' | 'due' | 'upcoming';
  note: string;
}

@Component({
  selector: 'app-welfare-detail',
  standalone: false,
  templateUrl: './welfare-detail.html',
  styleUrl: './welfare-detail.scss',
})
export class WelfareDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  memberId = '';
  loading = true;
  errorMessage = '';
  successMessage = '';

  settings: WelfareSettings | null = null;
  row: WelfareRow | null = null;
  months: MonthLine[] = [];

  payments: any[] = [];
  paymentsLoading = false;
  page = 1;
  pageSize = 15;
  totalPayments = 0;
  totalPages = 0;

  canManage = false;
  editingStart = false;
  startMonthInput = '';
  busy = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private welfare: WelfareService,
    private financeService: FinanceService,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage = this.permissionService.isAdmin || this.permissionService.finance.manage;
    this.memberId = this.route.snapshot.paramMap.get('memberId') || '';
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void {
    this.location.back();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.settings = await this.welfare.getSettings();
      const rows = this.settings ? await this.welfare.getOverview(this.memberId) : [];
      this.row = rows[0] ?? null;
      if (this.row) {
        this.buildMonths();
        this.startMonthInput = this.row.start_month.substring(0, 7);
        this.loadPayments(1);
      }
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not load this member.';
    } finally {
      this.loading = false;
    }
  }

  loadPayments(page: number): void {
    if (!this.settings) return;
    this.page = page;
    this.paymentsLoading = true;
    this.financeService
      .getGivingTransactions(page, this.pageSize, {
        memberId: this.memberId,
        categoryId: this.settings.category_id,
        startDate: this.row?.start_month,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.payments = data;
          this.totalPayments = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.paymentsLoading = false;
        },
        error: (e) => {
          this.errorMessage = e?.message || 'Could not load payments.';
          this.paymentsLoading = false;
        },
      });
  }

  /** Month-by-month picture built from total paid ÷ monthly amount */
  private buildMonths(): void {
    const r = this.row!;
    const start = new Date(r.start_month);
    const lines: MonthLine[] = [];
    // show every month due so far, plus any months already paid for in advance
    const total = Math.max(r.months_expected, r.months_covered + (r.credit > 0 ? 1 : 0));
    for (let i = 0; i < Math.min(total, 60); i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const due = i < r.months_expected;
      if (i < r.months_covered) {
        lines.push({ label, state: due ? 'covered' : 'upcoming', note: due ? 'Paid' : 'Paid in advance' });
      } else if (i === r.months_covered && r.credit > 0) {
        lines.push({
          label,
          state: due ? 'part' : 'upcoming',
          note: `${this.formatCurrency(r.credit)} of ${this.formatCurrency(r.monthly_amount)} paid`,
        });
      } else {
        lines.push({ label, state: 'due', note: `${this.formatCurrency(r.monthly_amount)} due` });
      }
    }
    this.months = lines.reverse(); // newest first
  }

  // ── Actions ────────────────────────────────────────────────
  async setStatus(status: 'active' | 'paused' | 'left'): Promise<void> {
    await this.run(async () => {
      await this.welfare.setStatus(this.memberId, status);
      this.flash('Status updated.');
    });
  }

  async saveStartMonth(): Promise<void> {
    await this.run(async () => {
      await this.welfare.setStartMonth(this.memberId, this.startMonthInput);
      this.editingStart = false;
      this.flash('Start month updated.');
    });
  }

  async removeFromScheme(): Promise<void> {
    if (!confirm('Remove this member from the welfare scheme? Their payments are not deleted.')) return;
    this.busy = true;
    try {
      await this.welfare.remove(this.memberId);
      this.router.navigate(['main/finance/welfare']);
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not remove member.';
      this.busy = false;
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.errorMessage = '';
    try {
      await fn();
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Something went wrong.';
    } finally {
      this.busy = false;
    }
  }

  openMemberProfile(): void {
    this.router.navigate(['main/members', this.memberId]);
  }

  // ── Display helpers ────────────────────────────────────────
  standingLabel(s: string): string {
    const map: Record<string, string> = {
      up_to_date: 'Up to date', ahead: 'Paid ahead', behind: 'Behind',
      not_paying: 'Not paying', paused: 'Paused', left: 'Left scheme',
    };
    return map[s] || s;
  }

  methodLabel(t: any): string {
    if (t.payment_channel) {
      const ch: Record<string, string> = { mobile_money: 'MoMo', card: 'Card', bank: 'Bank', bank_transfer: 'Bank' };
      return `Paystack · ${ch[t.payment_channel] || t.payment_channel}`;
    }
    if (t.payment_method === 'paystack') return 'Paystack';
    return (t.payment_method || '').replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase());
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  }

  formatMonth(date: string | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  private flash(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 4000);
  }
}