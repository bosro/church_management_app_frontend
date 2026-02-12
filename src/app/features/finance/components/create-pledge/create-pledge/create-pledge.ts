
// src/app/features/finance/components/create-pledge/create-pledge.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { GivingCategory } from '../../../../../models/giving.model';
import { Member } from '../../../../../models/member.model';
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

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private memberService: MemberService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadCategories();
    this.setupMemberSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.pledgeForm = this.fb.group({
      pledge_amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', [Validators.required]],
      category_id: [''],
      pledge_date: [today, [Validators.required]],
      due_date: [''],
      notes: ['']
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
      return;
    }

    if (!this.selectedMember) {
      this.errorMessage = 'Please select a member';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const pledgeData = {
      ...this.pledgeForm.value,
      member_id: this.selectedMember.id
    };

    this.financeService.createPledge(pledgeData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Pledge created successfully!';
          setTimeout(() => {
            this.router.navigate(['main/finance/pledges']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create pledge. Please try again.';
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
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.pledgeForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('min')) {
      return 'Amount must be greater than 0';
    }
    return '';
  }

  getMemberFullName(member: Member): string {
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: Member): string {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }
}
