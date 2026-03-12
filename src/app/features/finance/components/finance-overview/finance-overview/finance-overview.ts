// src/app/features/finance/components/finance-overview/finance-overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService, GivingStatistics, TopGiver } from '../../../services/finance.service';

@Component({
  selector: 'app-finance-overview',
  standalone: false,
  templateUrl: './finance-overview.html',
  styleUrl: './finance-overview.scss',
})
export class FinanceOverview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  statistics: GivingStatistics | null = null;
  recentTransactions: any[] = [];
  topGivers: TopGiver[] = [];
  givingTrends: any = null;

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  errorMessage = '';
  canViewFinance = false;
  canManageFinance = false;

  // Chart data for giving trends
  chartData = {
    labels: [] as string[],
    tithe: [] as number[],
    offering: [] as number[],
  };

  constructor(
    private financeService: FinanceService,
    private router: Router
  ) {
    // Generate year options (current year and 5 years back)
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
    this.canViewFinance = this.financeService.canViewFinance();
    this.canManageFinance = this.financeService.canManageFinance();

    if (!this.canViewFinance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadFinanceData(): void {
    this.loading = true;
    this.errorMessage = '';

    // Load statistics
    this.financeService.getGivingStatistics(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          console.log('Finance stats loaded:', stats); // Debug log
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
          console.error('Error loading statistics:', error);
        }
      });

    // Load recent transactions
    this.financeService.getGivingTransactions(1, 10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          this.recentTransactions = data;
          console.log('Recent transactions loaded:', data.length); // Debug log
        },
        error: (error) => {
          console.error('Error loading transactions:', error);
        }
      });

    // Load top givers
    this.financeService.getTopGivers(5, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => {
          this.topGivers = givers;
          console.log('Top givers loaded:', givers.length); // Debug log
        },
        error: (error) => {
          console.error('Error loading top givers:', error);
        }
      });

    // Load giving trends for chart
    this.loadGivingTrendsChart();
  }

  private loadGivingTrendsChart(): void {
    const currentYear = new Date().getFullYear();

    // Load monthly data for current year
    this.financeService.getMonthlyGivingData(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.prepareChartData(data);
          console.log('Chart data prepared:', this.chartData); // Debug log
        },
        error: (error) => {
          console.error('Error loading chart data:', error);
          // Set empty chart data
          this.chartData = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            tithe: Array(12).fill(0),
            offering: Array(12).fill(0),
          };
        }
      });
  }

  private prepareChartData(monthlyData: any[]): void {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const tithe: number[] = Array(12).fill(0);
    const offering: number[] = Array(12).fill(0);

    monthlyData.forEach((item: any) => {
      const monthIndex = item.month - 1; // months are 1-12
      const categoryName = (item.category_name || '').toLowerCase();

      if (categoryName.includes('tithe')) {
        tithe[monthIndex] += item.total_amount || 0;
      } else if (categoryName.includes('offering') || categoryName.includes('seed')) {
        offering[monthIndex] += item.total_amount || 0;
      }
    });

    this.chartData = {
      labels: monthNames,
      tithe,
      offering,
    };
  }

  onYearChange(): void {
    this.loadFinanceData();
  }

  // Navigation
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


  
  // Helper methods
  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  }

  getMemberName(transaction: any): string {
    if (transaction.member) {
      return `${transaction.member.first_name} ${transaction.member.last_name}`;
    }
    return 'Anonymous';
  }

  getMemberInitials(transaction: any): string {
    if (transaction.member) {
      return `${transaction.member.first_name[0]}${transaction.member.last_name[0]}`.toUpperCase();
    }
    return 'A';
  }
}
