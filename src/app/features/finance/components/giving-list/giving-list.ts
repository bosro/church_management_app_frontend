// src/app/features/finance/components/giving-list/giving-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { GivingCategory, PaymentMethod } from '../../../../models/giving.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

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

  currentPage = 1;
  pageSize = 20;
  totalTransactions = 0;
  totalPages = 0;

  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryControl = new FormControl('');
  paymentMethodControl = new FormControl('');

  // FIX: standardized to 'cheque' (matches record-giving and DB)
  paymentMethods: { value: PaymentMethod | ''; label: string }[] = [
    { value: '', label: 'All Methods' },
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' },
  ];

  canViewFinance = false;
  canManageFinance = false;

  constructor(
    private financeService: FinanceService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
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

    if (!this.canViewFinance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadCategories(): void {
    this.financeService
      .getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => (this.categories = c),
        error: (e) => console.error(e),
      });
  }

  private setupFilterListeners(): void {
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
    if (this.startDateControl.value)
      filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value) filters.endDate = this.endDateControl.value;
    if (this.categoryControl.value)
      filters.categoryId = this.categoryControl.value;
    if (this.paymentMethodControl.value)
      filters.paymentMethod = this.paymentMethodControl.value;

    this.financeService
      .getGivingTransactions(this.currentPage, this.pageSize, filters)
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
        },
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

    this.financeService
      .exportGivingReport(startDate, endDate, categoryId)
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
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export report';
        },
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
    if (
      !confirm(
        'Are you sure you want to delete this transaction? This action cannot be undone.',
      )
    )
      return;

    this.financeService
      .deleteGivingTransaction(transactionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Transaction deleted!';
          this.loadTransactions();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete transaction';
        },
      });
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadTransactions();
      window.scrollTo(0, 0);
    }
  }
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadTransactions();
      window.scrollTo(0, 0);
    }
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
    }).format(amount || 0);
  }
  getMemberName(t: any): string {
    return t.member
      ? `${t.member.first_name} ${t.member.last_name}`
      : 'Anonymous';
  }
  getMemberInitials(t: any): string {
    return t.member
      ? `${t.member.first_name[0]}${t.member.last_name[0]}`.toUpperCase()
      : 'A';
  }
}
