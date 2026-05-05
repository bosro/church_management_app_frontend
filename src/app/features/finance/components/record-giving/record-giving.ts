// src/app/features/finance/components/record-giving/record-giving.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { MemberService } from '../../../members/services/member.service';
import { GivingCategory, PaymentMethod } from '../../../../models/giving.model';
import { Member } from '../../../../models/member.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-record-giving',
  standalone: false,
  templateUrl: './record-giving.html',
  styleUrl: './record-giving.scss',
})
export class RecordGiving implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Mode toggle ─────────────────────────────────────────────
  mode: 'individual' | 'bulk' = 'individual';

  givingForm!: FormGroup;
  bulkForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  categories: GivingCategory[] = [];
  loadingCategories = true;

  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;
  selectedMember: Member | null = null;

  paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' },
  ];

  bulkPaymentMethods = [
    { value: 'mixed', label: 'Mixed (cash + mobile)' },
    { value: 'cash', label: 'Cash only' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' },
  ];

  currencies = ['GHS', 'USD', 'EUR', 'GBP'];
  canManageFinance = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private memberService: MemberService,
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForms();
    this.loadCategories();
    this.setupMemberSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const manageRoles = ['finance_officer'];
    this.canManageFinance =
      this.permissionService.isAdmin ||
      this.permissionService.finance.record ||
      this.permissionService.finance.manage ||
      manageRoles.includes(role);
    if (!this.canManageFinance) this.router.navigate(['/unauthorized']);
  }

  private initForms(): void {
    const today = new Date().toISOString().split('T')[0];

    this.givingForm = this.fb.group({
      transaction_date: [today, [Validators.required]],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', [Validators.required]],
      category_id: ['', [Validators.required]],
      payment_method: ['cash', [Validators.required]],
      transaction_reference: ['', [Validators.maxLength(100)]],
      notes: ['', [Validators.maxLength(500)]],
    });

    this.bulkForm = this.fb.group({
      record_date: [today, [Validators.required]],
      category_id: ['', [Validators.required]],
      total_amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', [Validators.required]],
      payment_method: ['mixed', [Validators.required]],
      attendee_count: ['', [Validators.min(1)]],
      description: ['', [Validators.maxLength(200)]],
      notes: ['', [Validators.maxLength(500)]],
    });
  }

  switchMode(m: 'individual' | 'bulk'): void {
    this.mode = m;
    this.errorMessage = '';
    this.successMessage = '';
  }

  private loadCategories(): void {
    this.loadingCategories = true;
    this.financeService
      .getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.loadingCategories = false;
        },
        error: () => {
          this.loadingCategories = false;
        },
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.memberService.searchMembers(query);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: () => {
          this.searching = false;
          this.searchResults = [];
        },
      });
  }

  selectMember(member: Member): void {
    this.selectedMember = member;
    this.searchControl.setValue('');
    this.searchResults = [];
  }
  removeMember(): void {
    this.selectedMember = null;
  }

  // ── Individual giving submit ─────────────────────────────────
  onSubmitIndividual(): void {
    if (this.givingForm.invalid) {
      this.markFormGroupTouched(this.givingForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const transactionData = {
      ...this.givingForm.value,
      member_id: this.selectedMember?.id || null,
      amount: parseFloat(this.givingForm.value.amount),
    };

    this.financeService
      .createGivingTransaction(transactionData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Giving recorded successfully!';
          this.loading = false;
          setTimeout(() => this.router.navigate(['main/finance']), 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to record giving.';
        },
      });
  }

  // ── Bulk giving submit ───────────────────────────────────────
  onSubmitBulk(): void {
    if (this.bulkForm.invalid) {
      this.markFormGroupTouched(this.bulkForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const data = {
      category_id: this.bulkForm.value.category_id,
      total_amount: parseFloat(this.bulkForm.value.total_amount),
      currency: this.bulkForm.value.currency,
      payment_method: this.bulkForm.value.payment_method,
      record_date: this.bulkForm.value.record_date,
      attendee_count: this.bulkForm.value.attendee_count
        ? parseInt(this.bulkForm.value.attendee_count)
        : undefined,
      description: this.bulkForm.value.description || undefined,
      notes: this.bulkForm.value.notes || undefined,
    };

    this.financeService
      .createBulkGivingRecord(data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Bulk giving record saved successfully!';
          this.loading = false;
          setTimeout(() => this.router.navigate(['main/finance']), 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to save bulk record.';
        },
      });
  }

  cancel(): void {
    this.router.navigate(['main/finance']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) this.markFormGroupTouched(control);
    });
  }

  getErrorMessage(
    fieldName: string,
    form: FormGroup = this.givingForm,
  ): string {
    const control = form.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('min')) return 'Must be greater than 0';
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  getMemberFullName(member: Member): string {
    return `${member.first_name} ${member.last_name}`;
  }
  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }
}
