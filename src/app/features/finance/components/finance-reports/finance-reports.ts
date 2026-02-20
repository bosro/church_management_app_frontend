// src/app/features/finance/components/finance-reports/finance-reports.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService, GivingStatistics, TopGiver } from '../../services/finance.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-finance-reports',
  standalone: false,
  templateUrl: './finance-reports.html',
  styleUrl: './finance-reports.scss',
})
export class FinanceReports implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  statistics: GivingStatistics | null = null;
  topGivers: TopGiver[] = [];
  errorMessage = '';
  successMessage = '';

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  // Date filters for exports
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');

  // Permissions
  canViewFinance = false;

  constructor(
    private financeService: FinanceService,
    private router: Router
  ) {
    // Generate year options (current year and 9 years back)
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      this.years.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.checkPermissions();
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canViewFinance = this.financeService.canViewFinance();

    if (!this.canViewFinance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  loadReports(): void {
    this.loading = true;
    this.errorMessage = '';

    // Load statistics
    this.financeService.getGivingStatistics(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
          console.error('Error loading statistics:', error);
        }
      });

    // Load top givers
    this.financeService.getTopGivers(10, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (givers) => {
          this.topGivers = givers;
        },
        error: (error) => {
          console.error('Error loading top givers:', error);
        }
      });
  }

  onYearChange(): void {
    this.loadReports();
  }

  exportGivingReport(): void {
    const startDate = this.startDateControl.value || '';
    const endDate = this.endDateControl.value || '';

    if (!startDate || !endDate) {
      this.errorMessage = 'Please select both start and end dates';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      this.errorMessage = 'Start date cannot be after end date';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
      return;
    }

    this.financeService.exportGivingReport(startDate, endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.downloadFile(blob, `giving_report_${startDate}_to_${endDate}.csv`);
          this.successMessage = 'Giving report exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export giving report';
          console.error('Export error:', error);
        }
      });
  }

  exportPledgesReport(): void {
    this.financeService.exportPledgesReport()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.downloadFile(blob, `pledges_report_${new Date().toISOString().split('T')[0]}.csv`);
          this.successMessage = 'Pledges report exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export pledges report';
          console.error('Export error:', error);
        }
      });
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  }
}
