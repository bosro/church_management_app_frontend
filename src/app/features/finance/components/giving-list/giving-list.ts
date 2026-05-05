// src/app/features/finance/components/giving-list/giving-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import {
  GivingCategory,
  PaymentMethod,
  CategorySummary,
} from '../../../../models/giving.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';
import { MemberService } from '../../../members/services/member.service';
import { Member } from '../../../../models/member.model';
import { Location } from '@angular/common';

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
  categorySummaries: CategorySummary[] = [];
  loading = false;
  loadingSummaries = false;
  errorMessage = '';
  successMessage = '';

  currentPage = 1;
  pageSize = 20;
  totalTransactions = 0;
  totalPages = 0;

  // ── Single source of truth for all active filters ─────────────
  // Never read from categoryControl directly for API calls.
  // activeCategoryId is the canonical filter value for the query.
  activeCategoryId: string | null = null;
  activeCategoryName: string | null = null;

  // These controls are only for the UI inputs — they don't drive
  // the query directly; they call applyFilters() on change.
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryControl = new FormControl('');
  paymentMethodControl = new FormControl('');

  paymentMethods: { value: PaymentMethod | ''; label: string }[] = [
    { value: '', label: 'All Methods' },
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' },
  ];

  // Edit transaction modal
  showEditModal = false;
  editingTransaction: any = null;
  editForm!: FormGroup;
  saving = false;

  // Member search inside edit modal
  editSearchControl = new FormControl('');
  editSearchResults: Member[] = [];
  editSearching = false;
  editSelectedMember: Member | null = null;

  canViewFinance = false;
  canManageFinance = false;

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
    private fb: FormBuilder,
    private financeService: FinanceService,
    private memberService: MemberService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
    private authService: AuthService,
     private location: Location,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initEditForm();
    this.setupEditMemberSearch();
    this.setupFilterListeners();

    // ── Load categories first, then check query params ────────────
    // We need categories loaded so we can resolve the name from the ID
    this.financeService
      .getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cats) => {
          this.categories = cats;

          // Now read query param — this is how the overview card navigates here
          const paramCategoryId =
            this.route.snapshot.queryParamMap.get('categoryId');
          if (paramCategoryId) {
            const cat = cats.find((c) => c.id === paramCategoryId);
            this.activeCategoryId = paramCategoryId;
            this.activeCategoryName = cat?.name || null;
            // Sync the dropdown UI without triggering its valueChanges listener
            this.categoryControl.setValue(paramCategoryId, {
              emitEvent: false,
            });
          }

          // Now load everything else
          this.loadCategorySummaries();
          this.loadTransactions();
        },
        error: (e) => {
          console.error(e);
          this.loadCategorySummaries();
          this.loadTransactions();
        },
      });
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

  private initEditForm(): void {
    this.editForm = this.fb.group({
      transaction_date: ['', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', Validators.required],
      category_id: ['', Validators.required],
      payment_method: ['cash', Validators.required],
      transaction_reference: [''],
      notes: [''],
    });
  }

  private setupEditMemberSearch(): void {
    this.editSearchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            this.editSearchResults = [];
            return [];
          }
          this.editSearching = true;
          return this.memberService.searchMembers(query);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.editSearchResults = members;
          this.editSearching = false;
        },
        error: () => {
          this.editSearching = false;
          this.editSearchResults = [];
        },
      });
  }

  // ── Filter listeners ─────────────────────────────────────────
  // categoryControl drives activeCategoryId; the card click does the same.
  // Both paths converge at applyFilters() so there's no conflict.
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

    // Dropdown select for category — keep activeCategoryId in sync
    this.categoryControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        this.currentPage = 1;
        if (val) {
          const cat = this.categories.find((c) => c.id === val);
          this.activeCategoryId = val;
          this.activeCategoryName = cat?.name || null;
        } else {
          this.activeCategoryId = null;
          this.activeCategoryName = null;
        }
        this.loadTransactions();
      });

    this.paymentMethodControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTransactions();
      });
  }

  // ── Category card click ──────────────────────────────────────
  selectCategoryCard(summary: CategorySummary): void {
    if (this.activeCategoryId === summary.category_id) {
      // Toggle off
      this.activeCategoryId = null;
      this.activeCategoryName = null;
      this.categoryControl.setValue('', { emitEvent: false }); // sync UI, no extra query
    } else {
      this.activeCategoryId = summary.category_id;
      this.activeCategoryName = summary.category_name;
      this.categoryControl.setValue(summary.category_id, { emitEvent: false }); // sync UI
    }
    this.currentPage = 1;
    this.loadTransactions(); // single call, no race condition
  }

  clearCategoryFilter(): void {
    this.activeCategoryId = null;
    this.activeCategoryName = null;
    this.categoryControl.setValue('', { emitEvent: false });
    this.currentPage = 1;
    this.loadTransactions();
  }

  loadCategorySummaries(): void {
    this.loadingSummaries = true;
    const year = new Date().getFullYear();
    this.financeService
      .getCategorySummary(year)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summaries) => {
          this.categorySummaries = summaries;
          this.loadingSummaries = false;
        },
        error: () => {
          this.loadingSummaries = false;
        },
      });
  }

  // ── Core data load ───────────────────────────────────────────
  // Reads activeCategoryId (single source of truth) — never the control value directly.
  loadTransactions(): void {
    this.loading = true;
    this.errorMessage = '';

    const filters: any = {};
    if (this.startDateControl.value)
      filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value) filters.endDate = this.endDateControl.value;
    if (this.activeCategoryId) filters.categoryId = this.activeCategoryId;
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
    // Use emitEvent: false so listeners don't each fire a separate query
    this.startDateControl.setValue('', { emitEvent: false });
    this.endDateControl.setValue('', { emitEvent: false });
    this.categoryControl.setValue('', { emitEvent: false });
    this.paymentMethodControl.setValue('', { emitEvent: false });
    this.activeCategoryId = null;
    this.activeCategoryName = null;
    this.currentPage = 1;
    this.loadTransactions(); // single call
  }

  // ── Icon helpers ─────────────────────────────────────────────
  getCategoryIcon(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].icon;
  }
  getCategoryIconBg(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].bg;
  }
  getCategoryIconColor(index: number): string {
    return this.iconPalette[index % this.iconPalette.length].color;
  }

  // ── Edit transaction ─────────────────────────────────────────
  openEditModal(transaction: any, event: Event): void {
    event.stopPropagation();
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to edit transactions';
      return;
    }

    this.editingTransaction = transaction;
    this.editSelectedMember = transaction.member
      ? ({
          id: transaction.member_id,
          first_name: transaction.member.first_name,
          last_name: transaction.member.last_name,
          member_number: transaction.member.member_number,
          photo_url: transaction.member.photo_url,
        } as Member)
      : null;

    this.editForm.patchValue({
      transaction_date: transaction.transaction_date,
      amount: transaction.amount,
      currency: transaction.currency,
      category_id: transaction.category_id,
      payment_method: transaction.payment_method,
      transaction_reference: transaction.transaction_reference || '',
      notes: transaction.notes || '',
    });
    this.editSearchControl.setValue('');
    this.editSearchResults = [];
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingTransaction = null;
    this.editSelectedMember = null;
    this.editForm.reset({ currency: 'GHS', payment_method: 'cash' });
  }

  selectEditMember(member: Member): void {
    this.editSelectedMember = member;
    this.editSearchControl.setValue('');
    this.editSearchResults = [];
  }

  removeEditMember(): void {
    this.editSelectedMember = null;
  }

  saveEdit(): void {
    if (this.editForm.invalid) {
      Object.keys(this.editForm.controls).forEach((k) =>
        this.editForm.get(k)?.markAsTouched(),
      );
      return;
    }
    this.saving = true;
    const data = {
      ...this.editForm.value,
      member_id: this.editSelectedMember?.id || null,
      amount: parseFloat(this.editForm.value.amount),
    };
    this.financeService
      .updateGivingTransaction(this.editingTransaction.id, data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Transaction updated successfully!';
          this.saving = false;
          this.closeEditModal();
          this.loadTransactions();
          this.loadCategorySummaries();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to update transaction';
          this.saving = false;
        },
      });
  }

  // ── Export ───────────────────────────────────────────────────
  exportReport(): void {
    if (!this.canViewFinance) {
      this.errorMessage = 'You do not have permission to export reports';
      return;
    }
    const startDate = this.startDateControl.value || '';
    const endDate = this.endDateControl.value || '';
    const categoryId = this.activeCategoryId || undefined;

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
          this.loadCategorySummaries();
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

  // ── Formatters ───────────────────────────────────────────────
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
  getMemberFullName(m: Member): string {
    return `${m.first_name} ${m.last_name}`;
  }
  getMemberInitialsFromMember(m: Member): string {
    return `${m.first_name[0]}${m.last_name[0]}`.toUpperCase();
  }

  getEditErrorMessage(fieldName: string): string {
    const control = this.editForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('min')) return 'Amount must be greater than 0';
    return 'Invalid input';
  }

    goBack(): void {
    this.location.back();
  }
}
