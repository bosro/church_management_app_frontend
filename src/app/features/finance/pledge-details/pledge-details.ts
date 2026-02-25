
// src/app/features/finance/components/pledge-details/pledge-details.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../services/finance.service';
import { PaymentMethod } from '../../../models/giving.model';

@Component({
  selector: 'app-pledge-details',
  standalone: false,
  templateUrl: './pledge-details.html',
  styleUrl: './pledge-details.scss',
})
export class PledgeDetails implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pledgeId: string = '';
  pledge: any = null;
  payments: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Payment modal
  showPaymentModal = false;
  paymentForm!: FormGroup;
  recordingPayment = false;

  // Payment methods
  paymentMethods: PaymentMethod[] = ['cash', 'mobile_money', 'bank_transfer', 'check', 'card', 'online'];

  // Permissions
  canManageFinance = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private financeService: FinanceService
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.pledgeId = this.route.snapshot.paramMap.get('id') || '';
    this.initializePaymentForm();

    if (this.pledgeId) {
      this.loadPledgeDetails();
      this.loadPaymentHistory();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageFinance = this.financeService.canManageFinance();
  }

  private initializePaymentForm(): void {
    this.paymentForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', Validators.required],
      payment_date: [new Date().toISOString().split('T')[0], Validators.required],
      payment_method: ['cash', Validators.required],
      transaction_reference: [''],
      notes: ['']
    });
  }

  private loadPledgeDetails(): void {
    this.loading = true;
    this.errorMessage = '';

    this.financeService.getPledgeById(this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pledge) => {
          this.pledge = pledge;

          // Set currency in payment form
          this.paymentForm.patchValue({
            currency: pledge.currency
          });

          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load pledge details';
          this.loading = false;
          console.error('Error loading pledge:', error);
        }
      });
  }

  private loadPaymentHistory(): void {
    this.financeService.getPledgePayments(this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payments) => {
          this.payments = payments;
        },
        error: (error) => {
          console.error('Error loading payments:', error);
        }
      });
  }

  openPaymentModal(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to record payments';
      return;
    }

    if (this.pledge.is_fulfilled) {
      this.errorMessage = 'This pledge has already been fulfilled';
      return;
    }

    const remainingBalance = this.getBalance();
    this.paymentForm.patchValue({
      amount: remainingBalance,
      currency: this.pledge.currency
    });

    // Set max validator
    this.paymentForm.get('amount')?.setValidators([
      Validators.required,
      Validators.min(0.01),
      Validators.max(remainingBalance)
    ]);
    this.paymentForm.get('amount')?.updateValueAndValidity();

    this.showPaymentModal = true;
  }

  closePaymentModal(): void {
    this.showPaymentModal = false;
    this.paymentForm.reset({
      amount: '',
      currency: this.pledge?.currency || 'GHS',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      transaction_reference: '',
      notes: ''
    });
  }

  recordPayment(): void {
    if (this.paymentForm.invalid) {
      Object.keys(this.paymentForm.controls).forEach(key => {
        this.paymentForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.recordingPayment = true;
    this.errorMessage = '';

    const paymentData = this.paymentForm.value;

    this.financeService.recordPledgePayment(this.pledgeId, paymentData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Payment recorded successfully!';
          this.loadPledgeDetails();
          this.loadPaymentHistory();
          this.closePaymentModal();
          this.recordingPayment = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to record payment';
          this.recordingPayment = false;
          console.error('Error recording payment:', error);
        }
      });
  }

  deletePayment(paymentId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to delete payments';
      return;
    }

    if (!confirm('Are you sure you want to delete this payment? This will adjust the pledge balance.')) {
      return;
    }

    this.financeService.deletePledgePayment(paymentId, this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Payment deleted successfully!';
          this.loadPledgeDetails();
          this.loadPaymentHistory();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete payment';
          console.error('Error deleting payment:', error);
        }
      });
  }

  goBack(): void {
    this.router.navigate(['main/finance/pledges']);
  }

  // Helper methods
  getPledgerName(): string {
    if (this.pledge.member) {
      return `${this.pledge.member.first_name} ${this.pledge.member.last_name}`;
    }
    if (this.pledge.visitor_first_name && this.pledge.visitor_last_name) {
      return `${this.pledge.visitor_first_name} ${this.pledge.visitor_last_name}`;
    }
    return 'Unknown';
  }

  getPledgerType(): string {
    return this.pledge.member ? 'Member' : 'Visitor/Guest';
  }

  getPledgerInitials(): string {
    if (this.pledge.member) {
      return `${this.pledge.member.first_name[0]}${this.pledge.member.last_name[0]}`.toUpperCase();
    }
    if (this.pledge.visitor_first_name && this.pledge.visitor_last_name) {
      return `${this.pledge.visitor_first_name[0]}${this.pledge.visitor_last_name[0]}`.toUpperCase();
    }
    return '?';
  }

  getBalance(): number {
    return this.pledge.pledge_amount - this.pledge.amount_paid;
  }

  getProgressPercentage(): number {
    if (this.pledge.pledge_amount === 0) return 0;
    const percentage = (this.pledge.amount_paid / this.pledge.pledge_amount) * 100;
    return Math.min(Math.round(percentage), 100);
  }

  getProgressClass(): string {
    const percentage = this.getProgressPercentage();
    if (percentage >= 100) return 'progress-complete';
    if (percentage >= 50) return 'progress-medium';
    return 'progress-low';
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  }

  formatPaymentMethod(method: string): string {
    return method.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}
