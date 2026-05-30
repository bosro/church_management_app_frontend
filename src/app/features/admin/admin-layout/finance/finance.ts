// src/app/features/admin/super-admin-finance/super-admin-finance.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from '../../../../core/services/supabase';
import { AuthService } from '../../../../core/services/auth';


export interface ChurchGivingStat {
  church_id: string;
  church_name: string;
  total_giving: number;
  total_transactions: number;
  total_bulk: number;
  total_expenses: number;
  net_balance: number;
  member_count: number;
  payment_links_count: number;
}

export interface MonthlyTrend {
  month: number;
  month_name: string;
  total_giving: number;
  church_count: number;
}

export interface RecentTransaction {
  id: string;
  church_name: string;
  member_name: string;
  category_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_date: string;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  church_id: string;
  amount: number;
  currency: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  reason?: string;
  status: string;
  rejection_reason?: string;
  paystack_transfer_code?: string;
  created_at: string;
  church?: { name: string };
  withdrawal_type?: string
  momo_number?: string | number
  momo_provider?: string
}

@Component({
  selector: 'app-finance',
  standalone: false,
  templateUrl: './finance.html',
  styleUrl: './finance.scss',
})
export class Finance implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  selectedYear = new Date().getFullYear();
  years: number[] = [];

  // Stats
  churchStats: ChurchGivingStat[] = [];
  monthlyTrend: MonthlyTrend[] = [];
  recentTransactions: RecentTransaction[] = [];
  withdrawalRequests: WithdrawalRequest[] = [];
  loadingWithdrawals = false;

  // Totals across all churches
  get platformTotal(): number { return this.churchStats.reduce((s, c) => s + c.total_giving, 0); }
  get platformTransactions(): number { return this.churchStats.reduce((s, c) => s + Number(c.total_transactions), 0); }
  get platformExpenses(): number { return this.churchStats.reduce((s, c) => s + c.total_expenses, 0); }
  get platformNetBalance(): number { return this.churchStats.reduce((s, c) => s + c.net_balance, 0); }
  get activeChurches(): number { return this.churchStats.length; }
  get pendingWithdrawals(): WithdrawalRequest[] { return this.withdrawalRequests.filter((r) => r.status === 'pending'); }

  // ── Withdrawal filters + pagination ──────────────────────
  withdrawalFilterStatus = '';
  withdrawalFilterChurch = '';
  withdrawalPage         = 1;
  withdrawalPageSize     = 10;

  get filteredWithdrawals(): WithdrawalRequest[] {
    return this.withdrawalRequests.filter((r) => {
      const statusMatch = !this.withdrawalFilterStatus || r.status === this.withdrawalFilterStatus;
      const churchMatch = !this.withdrawalFilterChurch ||
        (r.church?.name || '').toLowerCase().includes(this.withdrawalFilterChurch.toLowerCase());
      return statusMatch && churchMatch;
    });
  }
  get withdrawalTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredWithdrawals.length / this.withdrawalPageSize));
  }
  get pagedWithdrawals(): WithdrawalRequest[] {
    const start = (this.withdrawalPage - 1) * this.withdrawalPageSize;
    return this.filteredWithdrawals.slice(start, start + this.withdrawalPageSize);
  }
  onWithdrawalFilterChange(): void { this.withdrawalPage = 1; }

  // ── Recent transactions filters + pagination ───────────
  txnFilterChurch = '';
  txnFilterMethod = '';
  txnPage         = 1;
  txnPageSize     = 10;

  get filteredTransactions(): RecentTransaction[] {
    return this.recentTransactions.filter((t) => {
      const churchMatch = !this.txnFilterChurch ||
        t.church_name.toLowerCase().includes(this.txnFilterChurch.toLowerCase());
      const methodMatch = !this.txnFilterMethod || t.payment_method === this.txnFilterMethod;
      return churchMatch && methodMatch;
    });
  }
  get txnTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTransactions.length / this.txnPageSize));
  }
  get pagedTransactions(): RecentTransaction[] {
    const start = (this.txnPage - 1) * this.txnPageSize;
    return this.filteredTransactions.slice(start, start + this.txnPageSize);
  }
  onTxnFilterChange(): void { this.txnPage = 1; }

  // ── Church breakdown filters + pagination ───────────────
  churchFilterName = '';
  churchPage       = 1;
  churchPageSize   = 10;

  get filteredChurchStats(): ChurchGivingStat[] {
    return this.churchStats.filter((c) =>
      !this.churchFilterName ||
      c.church_name.toLowerCase().includes(this.churchFilterName.toLowerCase())
    );
  }
  get churchTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredChurchStats.length / this.churchPageSize));
  }
  get pagedChurchStats(): ChurchGivingStat[] {
    const start = (this.churchPage - 1) * this.churchPageSize;
    return this.filteredChurchStats.slice(start, start + this.churchPageSize);
  }
  onChurchFilterChange(): void { this.churchPage = 1; }

  // Withdrawal detail modal
  showWithdrawalModal = false;
  selectedWithdrawal: WithdrawalRequest | null = null;
  processingTransfer = false;
  rejectionReason = '';
  showRejectInput = false;
  withdrawalError = '';
  withdrawalSuccess = '';

  errorMessage = '';

  // ── Fee settings state ────────────────────────────────────
  platformFeeInput = 0.20;
  passFeesToPayer  = true;
  savingSettings   = false;
  settingsSaved    = false;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) this.years.push(currentYear - i);
  }

  ngOnInit(): void {
    this.loadAll();
    this.loadFeeSettings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.loadChurchStats();
    this.loadMonthlyTrend();
    this.loadRecentTransactions();
    this.loadWithdrawalRequests();
  }

  onYearChange(): void { this.loadChurchStats(); this.loadMonthlyTrend(); }

  private loadChurchStats(): void {
    this.supabase.client
      .rpc('get_platform_giving_stats', { fiscal_year_filter: this.selectedYear })
      .then(({ data, error }) => {
        this.loading = false;
        if (error) { this.errorMessage = error.message; return; }
        this.churchStats = data || [];
      });
  }

  private loadMonthlyTrend(): void {
    this.supabase.client
      .rpc('get_platform_monthly_trend', { fiscal_year_filter: this.selectedYear })
      .then(({ data, error }) => {
        if (!error) this.monthlyTrend = data || [];
      });
  }

  private loadRecentTransactions(): void {
    this.supabase.client
      .rpc('get_platform_recent_transactions', { p_limit: 30 })
      .then(({ data, error }) => {
        if (!error) this.recentTransactions = data || [];
      });
  }

  loadWithdrawalRequests(): void {
    this.loadingWithdrawals = true;
    this.supabase.client
      .from('withdrawal_requests')
      .select('*, church:churches!church_id(name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        this.loadingWithdrawals = false;
        if (!error) this.withdrawalRequests = data || [];
      });
  }

  // ── Withdrawal management ─────────────────────────────────
  openWithdrawalModal(request: WithdrawalRequest): void {
    this.selectedWithdrawal = request;
    this.rejectionReason = '';
    this.showRejectInput = false;
    this.withdrawalError = '';
    this.withdrawalSuccess = '';
    this.showWithdrawalModal = true;
  }

  closeWithdrawalModal(): void {
    this.showWithdrawalModal = false;
    this.selectedWithdrawal = null;
  }

  async approveWithdrawal(): Promise<void> {
    if (!this.selectedWithdrawal) return;
    this.processingTransfer = true;
    this.withdrawalError = '';

    // Step 1: Mark as approved in DB
    const { error } = await this.supabase.client
      .from('withdrawal_requests')
      .update({ status: 'approved', reviewed_by: this.authService.currentProfile?.id, reviewed_at: new Date().toISOString() })
      .eq('id', this.selectedWithdrawal.id);

    if (error) { this.withdrawalError = error.message; this.processingTransfer = false; return; }

    // Step 2: Initiate Paystack transfer via Edge Function
    const { data: { session } } = await this.supabase.client.auth.getSession();
    const supabaseUrl: string = (this.supabase.client as any).supabaseUrl ?? '';

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/paystack-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
        body: JSON.stringify({ withdrawal_request_id: this.selectedWithdrawal.id }),
      });
      const result = await res.json();
      this.processingTransfer = false;

      if (!res.ok) { this.withdrawalError = result.error || 'Transfer failed'; return; }

      this.withdrawalSuccess = result.message;
      this.loadWithdrawalRequests();
      setTimeout(() => this.closeWithdrawalModal(), 3000);
    } catch (err: any) {
      this.processingTransfer = false;
      this.withdrawalError = err.message;
    }
  }

  async rejectWithdrawal(): Promise<void> {
    if (!this.selectedWithdrawal || !this.rejectionReason.trim()) {
      this.showRejectInput = true;
      return;
    }

    const { error } = await this.supabase.client
      .from('withdrawal_requests')
      .update({
        status: 'rejected',
        rejection_reason: this.rejectionReason,
        reviewed_by: this.authService.currentProfile?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', this.selectedWithdrawal.id);

    if (error) { this.withdrawalError = error.message; return; }

    this.withdrawalSuccess = 'Request rejected and church has been notified.';
    this.loadWithdrawalRequests();
    setTimeout(() => this.closeWithdrawalModal(), 2000);
  }

  // ── Chart helpers ─────────────────────────────────────────
  getBarHeight(amount: number): number {
    const max = Math.max(...this.monthlyTrend.map((m) => m.total_giving), 1);
    return Math.round((amount / max) * 100);
  }

  getChurchBarWidth(amount: number): number {
    const max = Math.max(...this.churchStats.map((c) => c.total_giving), 1);
    return Math.round((amount / max) * 100);
  }

  // ── Formatters ────────────────────────────────────────────
  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  formatCompact(amount: number): string {
    if (amount >= 1_000_000) return `GHS ${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000)     return `GHS ${(amount / 1_000).toFixed(1)}K`;
    return this.formatCurrency(amount);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', processing: 'badge-processing', completed: 'badge-completed', failed: 'badge-failed' };
    return map[status] || '';
  }

  // ── Fee settings methods ─────────────────────────────────
  private loadFeeSettings(): void {
    this.supabase.client
      .from('platform_settings')
      .select('key, value')
      .in('key', ['platform_fee_percent', 'pass_fees_to_payer'])
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.key] = s.value; });
        if (map['platform_fee_percent']) this.platformFeeInput = parseFloat(map['platform_fee_percent']);
        if (map['pass_fees_to_payer'])   this.passFeesToPayer  = map['pass_fees_to_payer'] !== 'false';
      });
  }

  async saveFeeSettings(): Promise<void> {
    this.savingSettings = true;
    const userId = this.authService.currentProfile?.id;

    const upserts = [
      {
        key:        'platform_fee_percent',
        value:      this.platformFeeInput.toString(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      {
        key:        'pass_fees_to_payer',
        value:      this.passFeesToPayer.toString(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
    ];

    const { error } = await this.supabase.client
      .from('platform_settings')
      .upsert(upserts, { onConflict: 'key' });

    this.savingSettings = false;
    if (!error) {
      this.settingsSaved = true;
      setTimeout(() => (this.settingsSaved = false), 4000);
    }
  }

  // Live preview getters — example: church wants to receive GHS 100
  get previewChargeAmount(): string {
    if (!this.passFeesToPayer) return '100.00';
    const combinedRate = (1.95 + this.platformFeeInput) / 100;
    return (100 / (1 - combinedRate)).toFixed(2);
  }
  get previewPaystackFee(): string {
    return (parseFloat(this.previewChargeAmount) * 0.0195).toFixed(2);
  }
  get previewPlatformFee(): string {
    return (parseFloat(this.previewChargeAmount) * (this.platformFeeInput / 100)).toFixed(2);
  }
  get previewChurchReceives(): string {
    const charge   = parseFloat(this.previewChargeAmount);
    const paystack = parseFloat(this.previewPaystackFee);
    const platform = parseFloat(this.previewPlatformFee);
    return (charge - paystack - platform).toFixed(2);
  }

  getMethodIcon(method: string): string {
    const map: Record<string, string> = { paystack: 'ri-secure-payment-line', mobile_money: 'ri-smartphone-line', cash: 'ri-money-dollar-circle-line', bank_transfer: 'ri-bank-line', card: 'ri-bank-card-line' };
    return map[method] || 'ri-wallet-line';
  }
}
