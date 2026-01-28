

// src/app/features/finance/components/pledges-list/pledges-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';

@Component({
  selector: 'app-pledges',
  standalone: false,
  templateUrl: './pledges.html',
  styleUrl: './pledges.scss',
})
export class Pledges implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pledges: any[] = [];
  loading = false;

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPledges = 0;
  totalPages = 0;

  constructor(
    private financeService: FinanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPledges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPledges(): void {
    this.loading = true;

    this.financeService.getPledges(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.pledges = data;
          this.totalPledges = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading pledges:', error);
          this.loading = false;
        }
      });
  }

  createPledge(): void {
    this.router.navigate(['/finance/pledges/create']);
  }

  deletePledge(pledgeId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this pledge?')) {
      this.financeService.deletePledge(pledgeId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadPledges();
          },
          error: (error) => {
            console.error('Error deleting pledge:', error);
          }
        });
    }
  }

  exportPledges(): void {
    this.financeService.exportPledgesReport()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `pledges_report_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPledges();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPledges();
    }
  }

  // Helper methods
  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  getBalance(pledge: any): number {
    return pledge.pledge_amount - pledge.amount_paid;
  }

  getProgressPercentage(pledge: any): number {
    if (pledge.pledge_amount === 0) return 0;
    return Math.round((pledge.amount_paid / pledge.pledge_amount) * 100);
  }

  getProgressClass(percentage: number): string {
    if (percentage >= 100) return 'progress-complete';
    if (percentage >= 50) return 'progress-medium';
    return 'progress-low';
  }

  getMemberName(pledge: any): string {
    return `${pledge.member.first_name} ${pledge.member.last_name}`;
  }

  getMemberInitials(pledge: any): string {
    return `${pledge.member.first_name[0]}${pledge.member.last_name[0]}`.toUpperCase();
  }
}
