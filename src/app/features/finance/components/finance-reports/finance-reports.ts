
// src/app/features/finance/components/finance-reports/finance-reports.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';

@Component({
  selector: 'app-finance-reports',
  standalone: false,
  templateUrl: './finance-reports.html',
  styleUrl: './finance-reports.scss',
})
export class FinanceReports implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  statistics: any = null;
  topGivers: any[] = [];

  selectedYear = new Date().getFullYear();
  years: number[] = [];

  // Date filters for exports
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');

  constructor(private financeService: FinanceService) {
    // Generate year options
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      this.years.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadReports(): void {
    this.loading = true;

    // Load statistics
    this.financeService.getGivingStatistics(this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
          this.loading = false;
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

    this.financeService.exportGivingReport(startDate, endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.downloadFile(blob, 'giving_report.csv');
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  exportPledgesReport(): void {
    this.financeService.exportPledgesReport()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.downloadFile(blob, 'pledges_report.csv');
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }
}
