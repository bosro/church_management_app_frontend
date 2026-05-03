// src/app/features/finance/components/finance-overview/finance-overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  FinanceService,
  GivingStatistics,
  CombinedGivingStats,
  TopGiver,
} from '../../../services/finance.service';
import { CategorySummary } from '../../../../../models/giving.model';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';

@Component({
  selector: 'app-finance-overview',
  standalone: false,
  templateUrl: './finance-overview.html',
  styleUrl: './finance-overview.scss',
})
export class FinanceOverview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  // combinedStats replaces the old GivingStatistics for the top cards —
  // it includes both individual transactions AND bulk giving records
  combinedStats: CombinedGivingStats | null = null;
  // Keep the old stats as fallback for branch pastors who use a different query path
  statistics: GivingStatistics | null = null;

  recentTransactions: any[] = [];
  topGivers: TopGiver[] = [];

  // Category summary cards
  categorySummaries: CategorySummary[] = [];
  loadingCategories = false;

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  errorMessage = '';
  canViewFinance = false;
  canManageFinance = false;

  chartData = {
    labels: [] as string[],
    tithe: [] as number[],
    offering: [] as number[],
  };

  private iconPalette = [
    { icon: 'ri-hand-heart-line', bg: '#DDD6FE', color: '#5B21B6' },
    { icon: 'ri-money-dollar-circle-line', bg: '#D1FAE5', color: '#059669' },
    { icon: 'ri-building-line', bg: '#DBEAFE', color: '#2563EB' },
    { icon: 'ri-heart-line', bg: '#FCE7F3', color: '#DB2777' },
    { icon: 'ri-star-line', bg: '#FEF3C7', color: '#D97706' },
    { icon: 'ri-gift-line', bg: '#FEE2E2', color: '#DC2626' },
    { icon: 'ri-plant-line', bg: '#ECFDF5', color: '#10B981' },
    { icon: 'ri-home-heart-line', bg: '#EFF6FF', color: '#3B82F6' },
  ];

  constructor(
    private financeService: FinanceService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      this.years.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadFinanceData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const viewRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'finance_officer',
    ];
    const manageRoles = ['finance_officer'];

    this.canViewFinance =
      this.permissionService.isAdmin ||
      this.permissionService.finance.view ||
      viewRoles.includes(role);

    this.canManageFinance =
      this.permissionService.isAdmin ||
      this.permissionService.finance.manage ||
      this.permissionService.finance.record ||
      manageRoles.includes(role);

    if (!this.canViewFinance) this.router.navigate(['/unauthorized']);
  }

  loadFinanceData(): void {
    this.loading = true;
    this.errorMessage = '';

    // Combined stats (individual + bulk + expenses)
    this.financeService
      .getCombinedGivingStats(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.combinedStats = stats;
          this.loading = false;
        },
        error: (error) => {
          // Fallback to old stats RPC if combined doesn't exist yet
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
          this.loadFallbackStats();
        },
      });

    // Recent transactions
    this.financeService
      .getGivingTransactions(1, 10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          this.recentTransactions = data;
        },
        error: (error) => console.error('Error loading transactions:', error),
      });

    // Top givers
    this.financeService
      .getTopGivers(5, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => {
          this.topGivers = givers;
        },
        error: (error) => console.error('Error loading top givers:', error),
      });

    // Category summaries
    this.loadCategorySummaries();

    // Chart
    this.loadGivingTrendsChart();
  }

  private loadFallbackStats(): void {
    this.financeService
      .getGivingStatistics(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
        },
        error: () => {},
      });
  }

  loadCategorySummaries(): void {
    this.loadingCategories = true;
    this.financeService
      .getCategorySummary(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summaries) => {
          this.categorySummaries = summaries;
          this.loadingCategories = false;
        },
        error: () => {
          this.loadingCategories = false;
        },
      });
  }

  private loadGivingTrendsChart(): void {
    this.financeService
      .getMonthlyGivingData(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.prepareChartData(data);
        },
        error: () => {
          this.chartData = {
            labels: [
              'Jan',
              'Feb',
              'Mar',
              'Apr',
              'May',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Oct',
              'Nov',
              'Dec',
            ],
            tithe: Array(12).fill(0),
            offering: Array(12).fill(0),
          };
        },
      });
  }

  private prepareChartData(monthlyData: any[]): void {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const tithe: number[] = Array(12).fill(0);
    const offering: number[] = Array(12).fill(0);

    monthlyData.forEach((item: any) => {
      const monthIndex = item.month - 1;
      const categoryName = (item.category_name || '').toLowerCase();
      if (categoryName.includes('tithe')) {
        tithe[monthIndex] += item.total_amount || 0;
      } else if (
        categoryName.includes('offering') ||
        categoryName.includes('seed')
      ) {
        offering[monthIndex] += item.total_amount || 0;
      }
    });

    this.chartData = { labels: monthNames, tithe, offering };
  }

  onYearChange(): void {
    this.loadFinanceData();
  }

  // ── Stat helpers — use combinedStats when available ──────────
  get totalGiving(): number {
    return (
      this.combinedStats?.combined_total ?? this.statistics?.total_giving ?? 0
    );
  }
  get totalTithes(): number {
    return (
      this.combinedStats?.individual_tithes ??
      this.statistics?.total_tithes ??
      0
    );
  }
  get totalOfferings(): number {
    return (
      this.combinedStats?.individual_offerings ??
      this.statistics?.total_offerings ??
      0
    );
  }
  get totalTransactions(): number {
    return (
      (this.combinedStats?.individual_transactions ??
        this.statistics?.total_transactions ??
        0) + (this.combinedStats?.bulk_records_count ?? 0)
    );
  }
  get bulkTotal(): number {
    return this.combinedStats?.bulk_total ?? 0;
  }
  get totalExpenses(): number {
    return this.combinedStats?.total_expenses ?? 0;
  }
  get netTotal(): number {
    return this.combinedStats?.net_total ?? this.totalGiving;
  }
  get hasBulkOrExpenses(): boolean {
    return this.bulkTotal > 0 || this.totalExpenses > 0;
  }

  // ── Category icon helpers ────────────────────────────────────
  getCategoryIcon(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].icon;
  }
  getCategoryIconBg(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].bg;
  }
  getCategoryIconColor(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].color;
  }

  getCategoryTotal(summary: CategorySummary): number {
    return summary.total_giving + summary.total_bulk_giving;
  }

  // ── Navigation ───────────────────────────────────────────────
  recordGiving(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to record giving';
      return;
    }
    this.router.navigate(['main/finance/record-giving']);
  }
  viewAllGiving(): void {
    this.router.navigate(['main/finance/giving']);
  }
  viewPledges(): void {
    this.router.navigate(['main/finance/pledges']);
  }
  viewReports(): void {
    this.router.navigate(['main/finance/reports']);
  }
  manageCategories(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to manage categories';
      return;
    }
    this.router.navigate(['main/finance/categories']);
  }
  viewExpenses(): void {
    this.router.navigate(['main/finance/expenses']);
  }

  viewPaymentLinks(): void {
    this.router.navigate(['main/finance/payment-links']);
  }

  // Navigates to giving list and applies category filter via query param
  viewCategoryTransactions(categoryId: string): void {
    this.router.navigate(['main/finance/giving'], {
      queryParams: { categoryId },
    });
  }

  // ── Formatters ───────────────────────────────────────────────
  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
    }).format(amount || 0);
  }
  getMemberName(transaction: any): string {
    if (transaction.member)
      return `${transaction.member.first_name} ${transaction.member.last_name}`;
    return 'Anonymous';
  }
  getMemberInitials(transaction: any): string {
    if (transaction.member)
      return `${transaction.member.first_name[0]}${transaction.member.last_name[0]}`.toUpperCase();
    return 'A';
  }
}
