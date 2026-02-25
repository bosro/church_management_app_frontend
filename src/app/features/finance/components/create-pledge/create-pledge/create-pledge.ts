// src/app/features/finance/components/create-pledge/create-pledge.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { GivingCategory } from '../../../../../models/giving.model';
import { Member } from './../../../../../models/member.model';
import { FinanceService } from '../../../services/finance.service';
import { MemberService } from '../../../../members/services/member.service';

@Component({
  selector: 'app-create-pledge',
  standalone: false,
  templateUrl: './create-pledge.html',
  styleUrl: './create-pledge.scss',
})
export class CreatePledge implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pledgeForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // ✅ NEW: Pledge type
  pledgeType: 'member' | 'visitor' = 'member';

  // Categories
  categories: GivingCategory[] = [];
  loadingCategories = true;

  // Member search
  searchControl = new FormControl('');
  searchResults: Member[] = [];
  searching = false;
  selectedMember: Member | null = null;

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

    this.pledgeForm = this.fb.group({
      // Member field
      member_id: [''],

      // ✅ NEW: Visitor fields
      visitor_first_name: [''],
      visitor_last_name: [''],
      visitor_phone: [''],
      visitor_email: ['', Validators.email],

      // Common fields
      pledge_amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', [Validators.required]],
      category_id: [''],
      pledge_date: [today, [Validators.required]],
      due_date: [''],
      notes: ['', [Validators.maxLength(500)]]
    });

    // Set initial validators
    this.updateValidators();
  }

  // ✅ NEW: Toggle between member and visitor pledge
  togglePledgeType(type: 'member' | 'visitor'): void {
    this.pledgeType = type;
    this.updateValidators();

    // Clear the other type's data
    if (type === 'member') {
      this.pledgeForm.patchValue({
        visitor_first_name: '',
        visitor_last_name: '',
        visitor_phone: '',
        visitor_email: ''
      });
    } else {
      this.selectedMember = null;
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  // ✅ NEW: Update validators based on pledge type
  private updateValidators(): void {
    const visitorFirstName = this.pledgeForm.get('visitor_first_name');
    const visitorLastName = this.pledgeForm.get('visitor_last_name');
    const visitorEmail = this.pledgeForm.get('visitor_email');

    if (this.pledgeType === 'visitor') {
      // Visitor pledges require visitor fields
      visitorFirstName?.setValidators([Validators.required]);
      visitorLastName?.setValidators([Validators.required]);
      visitorEmail?.setValidators([Validators.email]);
    } else {
      // Member pledges don't need visitor fields
      visitorFirstName?.clearValidators();
      visitorLastName?.clearValidators();
      visitorEmail?.setValidators([Validators.email]);
    }

    visitorFirstName?.updateValueAndValidity();
    visitorLastName?.updateValueAndValidity();
    visitorEmail?.updateValueAndValidity();
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
    if (this.pledgeForm.invalid) {
      this.markFormGroupTouched(this.pledgeForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToError();
      return;
    }

    // ✅ Validate based on pledge type
    if (this.pledgeType === 'member' && !this.selectedMember) {
      this.errorMessage = 'Please select a member';
      this.scrollToTop();
      return;
    }

    if (this.pledgeType === 'visitor') {
      const firstName = this.pledgeForm.value.visitor_first_name?.trim();
      const lastName = this.pledgeForm.value.visitor_last_name?.trim();

      if (!firstName || !lastName) {
        this.errorMessage = 'Please enter visitor first and last name';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    // ✅ Build pledge data based on type
    const pledgeData: any = {
      pledge_amount: parseFloat(this.pledgeForm.value.pledge_amount),
      currency: this.pledgeForm.value.currency,
      category_id: this.pledgeForm.value.category_id || null,
      pledge_date: this.pledgeForm.value.pledge_date,
      due_date: this.pledgeForm.value.due_date || null,
      notes: this.pledgeForm.value.notes || null
    };

    if (this.pledgeType === 'member') {
      pledgeData.member_id = this.selectedMember!.id;
    } else {
      pledgeData.visitor_first_name = this.pledgeForm.value.visitor_first_name.trim();
      pledgeData.visitor_last_name = this.pledgeForm.value.visitor_last_name.trim();
      pledgeData.visitor_phone = this.pledgeForm.value.visitor_phone?.trim() || null;
      pledgeData.visitor_email = this.pledgeForm.value.visitor_email?.trim() || null;
    }

    this.financeService.createPledge(pledgeData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Pledge created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/finance/pledges']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create pledge. Please try again.';
          this.scrollToTop();
          console.error('Error creating pledge:', error);
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/finance/pledges']);
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
    const control = this.pledgeForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('min')) {
      return 'Amount must be greater than 0';
    }
    if (control.hasError('email')) {
      return 'Please enter a valid email address';
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
