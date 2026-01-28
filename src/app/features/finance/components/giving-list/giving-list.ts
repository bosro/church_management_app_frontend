
// src/app/features/finance/components/giving-list/giving-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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

  constructor(
    private financeService: FinanceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadTransactions();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    this.startDateControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });

    this.endDateControl.valueChanges
      .pipe(takeUntil(this.destroy$))
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
          console.error('Error loading transactions:', error);
          this.loading = false;
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
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (error) => {
          console.error('Export error:', error);
        }
      });
  }

  recordGiving(): void {
    this.router.navigate(['/finance/record-giving']);
  }

  deleteTransaction(transactionId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this transaction?')) {
      this.financeService.deleteGivingTransaction(transactionId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadTransactions();
          },
          error: (error) => {
            console.error('Error deleting transaction:', error);
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTransactions();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTransactions();
    }
  }

  // Helper methods
  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount);
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
