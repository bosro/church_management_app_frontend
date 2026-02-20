// src/app/features/finance/components/giving-list/giving-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { GivingCategory, PaymentMethod } from '../../../../models/giving.model';

@Component({
  selector: 'app-giving-list',
  standalone: false,
  templateUrl: './giving-list.html',
  styleUrl: './giving-list.scss',
})
export class GivingList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  transactions: any[] = [];
  categories: GivingCategory[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalTransactions = 0;
  totalPages = 0;

  // Filters
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryControl = new FormControl('');
  paymentMethodControl = new FormControl('');

  paymentMethods: { value: PaymentMethod | '', label: string }[] = [
    { value: '', label: 'All Methods' },
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' }
  ];

  // Permissions
  canViewFinance = false;
  canManageFinance = false;

  constructor(
    private financeService: FinanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadCategories();
    this.loadTransactions();
    this.setupFilterListeners();
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

  private loadCategories(): void {
    this.financeService.getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
        },
        error: (error) => {
          console.error('Error loading categories:', error);
        }
      });
  }

  private setupFilterListeners(): void {
    // Debounce filter changes to avoid excessive API calls
    this.startDateControl.valueChanges
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });

    this.endDateControl.valueChanges
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });

    this.categoryControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });

    this.paymentMethodControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });
  }

  loadTransactions(): void {
    this.loading = true;
    this.errorMessage = '';

    const filters: any = {};

    if (this.startDateControl.value) {
      filters.startDate = this.startDateControl.value;
    }
    if (this.endDateControl.value) {
      filters.endDate = this.endDateControl.value;
    }
    if (this.categoryControl.value) {
      filters.categoryId = this.categoryControl.value;
    }
    if (this.paymentMethodControl.value) {
      filters.paymentMethod = this.paymentMethodControl.value;
    }

    this.financeService.getGivingTransactions(this.currentPage, this.pageSize, filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.transactions = data;
          this.totalTransactions = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load transactions';
          this.loading = false;
          console.error('Error loading transactions:', error);
        }
      });
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
    this.categoryControl.setValue('');
    this.paymentMethodControl.setValue('');
  }

  exportReport(): void {
    if (!this.canViewFinance) {
      this.errorMessage = 'You do not have permission to export reports';
      return;
    }

    const startDate = this.startDateControl.value || '';
    const endDate = this.endDateControl.value || '';
    const categoryId = this.categoryControl.value || undefined;

    this.financeService.exportGivingReport(startDate, endDate, categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `giving_report_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Report exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export report';
          console.error('Export error:', error);
        }
      });
  }

  recordGiving(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to record giving';
      return;
    }
    this.router.navigate(['main/finance/record-giving']);
  }

  deleteTransaction(transactionId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to delete transactions';
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this transaction? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.financeService.deleteGivingTransaction(transactionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Transaction deleted successfully!';
          this.loadTransactions();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete transaction';
          console.error('Error deleting transaction:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTransactions();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTransactions();
      this.scrollToTop();
    }
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

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
