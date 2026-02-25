// src/app/features/finance/components/pledges-list/pledges-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';

@Component({
  selector: 'app-pledges-list',
  standalone: false,
  templateUrl: './pledges.html',
  styleUrl: './pledges.scss',
})
export class Pledges implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pledges: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPledges = 0;
  totalPages = 0;

  // Permissions
  canViewFinance = false;
  canManageFinance = false;

  constructor(
    private financeService: FinanceService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadPledges();
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

  loadPledges(): void {
    this.loading = true;
    this.errorMessage = '';

    this.financeService
      .getPledges(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.pledges = data;
          this.totalPledges = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load pledges';
          this.loading = false;
          console.error('Error loading pledges:', error);
        },
      });
  }

  createPledge(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to create pledges';
      return;
    }
    this.router.navigate(['main/finance/pledges/create']);
  }

  deletePledge(pledgeId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to delete pledges';
      return;
    }

    const confirmMessage =
      'Are you sure you want to delete this pledge? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.financeService
      .deletePledge(pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Pledge deleted successfully!';
          this.loadPledges();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete pledge';
          console.error('Error deleting pledge:', error);
        },
      });
  }

  exportPledges(): void {
    if (!this.canViewFinance) {
      this.errorMessage = 'You do not have permission to export pledges';
      return;
    }

    this.financeService
      .exportPledgesReport()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `pledges_report_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Pledges exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export pledges';
          console.error('Export error:', error);
        },
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPledges();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPledges();
      this.scrollToTop();
    }
  }

  viewPledgeDetails(pledgeId: string): void {
    this.router.navigate(['main/finance/pledges', pledgeId]);
  }

  // Helper methods
  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
    }).format(amount || 0);
  }

  getBalance(pledge: any): number {
    return pledge.pledge_amount - pledge.amount_paid;
  }

  getProgressPercentage(pledge: any): number {
    if (pledge.pledge_amount === 0) return 0;
    const percentage = (pledge.amount_paid / pledge.pledge_amount) * 100;
    return Math.min(Math.round(percentage), 100);
  }

  getProgressClass(percentage: number): string {
    if (percentage >= 100) return 'progress-complete';
    if (percentage >= 50) return 'progress-medium';
    return 'progress-low';
  }

  getMemberName(pledge: any): string {
    if (pledge.member) {
      return `${pledge.member.first_name} ${pledge.member.last_name}`;
    }
    return 'Unknown';
  }

  getMemberInitials(pledge: any): string {
    if (pledge.member) {
      return `${pledge.member.first_name[0]}${pledge.member.last_name[0]}`.toUpperCase();
    }
    return '?';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
