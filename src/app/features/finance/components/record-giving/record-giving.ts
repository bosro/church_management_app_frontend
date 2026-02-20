// src/app/features/finance/components/record-giving/record-giving.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { MemberService } from '../../../members/services/member.service';
import { GivingCategory, PaymentMethod } from '../../../../models/giving.model';
import { Member } from '../../../../models/member.model';

@Component({
  selector: 'app-record-giving',
  standalone: false,
  templateUrl: './record-giving.html',
  styleUrl: './record-giving.scss',
})
export class RecordGiving implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  givingForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Categories
  categories: GivingCategory[] = [];
  loadingCategories = true;

  // Member search
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;
  selectedMember: Member | null = null;

  // Payment methods
  paymentMethods: { value: PaymentMethod, label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' }
  ];

  // Currencies
  currencies = ['GHS', 'USD', 'EUR', 'GBP'];

  // Permissions
  canManageFinance = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private memberService: MemberService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCategories();
    this.setupMemberSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageFinance = this.financeService.canManageFinance();

    if (!this.canManageFinance) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.givingForm = this.fb.group({
      transaction_date: [today, [Validators.required]],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', [Validators.required]],
      category_id: ['', [Validators.required]],
      payment_method: ['cash', [Validators.required]],
      transaction_reference: ['', [Validators.maxLength(100)]],
      notes: ['', [Validators.maxLength(500)]]
    });
  }

  private loadCategories(): void {
    this.loadingCategories = true;

    this.financeService.getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.loadingCategories = false;
        },
        error: (error) => {
          console.error('Error loading categories:', error);
          this.loadingCategories = false;
        }
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.memberService.searchMembers(query);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searching = false;
          this.searchResults = [];
        }
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

  onSubmit(): void {
    if (this.givingForm.invalid) {
      this.markFormGroupTouched(this.givingForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToError();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const transactionData = {
      ...this.givingForm.value,
      member_id: this.selectedMember?.id || null,
      amount: parseFloat(this.givingForm.value.amount)
    };

    this.financeService.createGivingTransaction(transactionData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Giving recorded successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/finance']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to record giving. Please try again.';
          this.scrollToTop();
          console.error('Error recording giving:', error);
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/finance']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.givingForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('min')) {
      return 'Amount must be greater than 0';
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    return 'Invalid input';
  }

  getMemberFullName(member: Member): string {
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scrollToError(): void {
    const firstError = document.querySelector('.error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.scrollToTop();
    }
  }
}
