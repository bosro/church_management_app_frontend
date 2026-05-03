
// src/app/features/finance/components/category-expenses/category-expenses.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { GivingCategory, CategoryExpense } from '../../../../models/giving.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-category-expenses',
  standalone: false,
  templateUrl: './category-expenses.html',
  styleUrl: './category-expenses.scss',
})
export class CategoryExpenses implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  expenses: CategoryExpense[] = [];
  categories: GivingCategory[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  currentPage = 1;
  pageSize = 20;
  totalExpenses = 0;
  totalPages = 0;

  // Filters
  startDateControl = new FormControl('');
  endDateControl = new FormControl('');
  categoryFilterControl = new FormControl('');

  // Preselected category from query param
  preselectedCategoryId: string | null = null;
  preselectedCategoryName: string | null = null;

  // Modal state
  showModal = false;
  editingExpense: CategoryExpense | null = null;
  expenseForm!: FormGroup;
  saving = false;

  currencies = ['GHS', 'USD', 'EUR', 'GBP'];
  canManageFinance = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCategories();

    // Allow navigating here with ?categoryId=xxx to prefilter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['categoryId']) {
        this.preselectedCategoryId = params['categoryId'];
        this.categoryFilterControl.setValue(params['categoryId'], { emitEvent: false });
      }
    });

    this.loadExpenses();
    this.setupFilterListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const viewRoles = ['pastor', 'senior_pastor', 'associate_pastor', 'finance_officer'];
    const manageRoles = ['finance_officer'];

    const canView = this.permissionService.isAdmin || this.permissionService.finance.view || viewRoles.includes(role);
    this.canManageFinance = this.permissionService.isAdmin || this.permissionService.finance.manage || manageRoles.includes(role);

    if (!canView) this.router.navigate(['/unauthorized']);
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    this.expenseForm = this.fb.group({
      category_id: ['', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', Validators.required],
      expense_date: [today, Validators.required],
      title: ['', [Validators.required, Validators.maxLength(200)]],
      description: ['', Validators.maxLength(500)],
      receipt_reference: ['', Validators.maxLength(100)],
    });
  }

  private loadCategories(): void {
    this.financeService.getGivingCategories().pipe(takeUntil(this.destroy$)).subscribe({
      next: (cats) => {
        this.categories = cats;
        if (this.preselectedCategoryId) {
          const cat = cats.find((c) => c.id === this.preselectedCategoryId);
          this.preselectedCategoryName = cat?.name || null;
        }
      },
      error: (e) => console.error(e),
    });
  }

  private setupFilterListeners(): void {
    this.startDateControl.valueChanges.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
    this.endDateControl.valueChanges.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
    this.categoryFilterControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => { this.currentPage = 1; this.loadExpenses(); });
  }

  loadExpenses(): void {
    this.loading = true;
    this.errorMessage = '';
    const filters: any = {};
    if (this.startDateControl.value) filters.startDate = this.startDateControl.value;
    if (this.endDateControl.value) filters.endDate = this.endDateControl.value;
    if (this.categoryFilterControl.value) filters.categoryId = this.categoryFilterControl.value;

    this.financeService.getCategoryExpenses(this.currentPage, this.pageSize, filters).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ data, count }) => { this.expenses = data; this.totalExpenses = count; this.totalPages = Math.ceil(count / this.pageSize); this.loading = false; },
      error: (err) => { this.errorMessage = err.message || 'Failed to load expenses'; this.loading = false; },
    });
  }

  clearFilters(): void {
    this.startDateControl.setValue('');
    this.endDateControl.setValue('');
    this.categoryFilterControl.setValue('');
    this.preselectedCategoryId = null;
    this.preselectedCategoryName = null;
  }

  // ── Modal ────────────────────────────────────────────────────
  openCreateModal(): void {
    this.editingExpense = null;
    this.expenseForm.reset({ currency: 'GHS', expense_date: new Date().toISOString().split('T')[0], category_id: this.categoryFilterControl.value || '' });
    this.showModal = true;
  }

  openEditModal(expense: CategoryExpense, event: Event): void {
    event.stopPropagation();
    this.editingExpense = expense;
    this.expenseForm.patchValue({
      category_id: expense.category_id,
      amount: expense.amount,
      currency: expense.currency,
      expense_date: expense.expense_date,
      title: expense.title,
      description: expense.description || '',
      receipt_reference: expense.receipt_reference || '',
    });
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingExpense = null;
    this.expenseForm.reset({ currency: 'GHS', expense_date: new Date().toISOString().split('T')[0] });
  }

  saveExpense(): void {
    if (this.expenseForm.invalid) {
      Object.keys(this.expenseForm.controls).forEach((k) => this.expenseForm.get(k)?.markAsTouched());
      return;
    }
    this.saving = true;
    const formVal = this.expenseForm.value;
    const data = { ...formVal, amount: parseFloat(formVal.amount) };

    const obs$ = this.editingExpense
      ? this.financeService.updateCategoryExpense(this.editingExpense.id, data)
      : this.financeService.createCategoryExpense(data);

    obs$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.successMessage = this.editingExpense ? 'Expense updated!' : 'Expense recorded!';
        this.saving = false;
        this.closeModal();
        this.loadExpenses();
        setTimeout(() => (this.successMessage = ''), 3000);
      },
      error: (err) => { this.errorMessage = err.message || 'Failed to save expense'; this.saving = false; },
    });
  }

  deleteExpense(expenseId: string, event: Event): void {
    event.stopPropagation();
    if (!this.canManageFinance) { this.errorMessage = 'No permission to delete expenses'; return; }
    if (!confirm('Delete this expense? This cannot be undone.')) return;

    this.financeService.deleteCategoryExpense(expenseId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.successMessage = 'Expense deleted!'; this.loadExpenses(); setTimeout(() => (this.successMessage = ''), 3000); },
      error: (err) => { this.errorMessage = err.message || 'Failed to delete expense'; },
    });
  }

  previousPage(): void { if (this.currentPage > 1) { this.currentPage--; this.loadExpenses(); } }
  nextPage(): void { if (this.currentPage < this.totalPages) { this.currentPage++; this.loadExpenses(); } }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.expenseForm.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('min')) return 'Amount must be greater than 0';
    if (control.hasError('maxlength')) return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  goBack(): void { this.location.back(); }
}
