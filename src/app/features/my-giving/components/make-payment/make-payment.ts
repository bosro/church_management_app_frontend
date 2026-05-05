import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GivingCategory, CreateTransactionData } from '../../../../models/giving.model';
import { GivingService } from '../../services/giving';
import { AuthService } from '../../../../core/services/auth';
import { PaystackService } from '../../services/paystack';

@Component({
  selector: 'app-make-payment',
  standalone: false,
  templateUrl: './make-payment.html',
  styleUrl: './make-payment.scss',
})
export class MakePayment implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  categoriesLoading = false;
  submitting = false;
  categories: GivingCategory[] = [];
  successMessage = '';
  errorMessage = '';

  constructor(
    private givingService: GivingService,
    private paystackService: PaystackService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void { this.loadCategories(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCategories(): void {
    this.categoriesLoading = true;
    this.givingService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => { this.categories = c; this.categoriesLoading = false; },
        error: () => { this.errorMessage = 'Failed to load giving categories'; this.categoriesLoading = false; },
      });
  }

  onFormSubmit(formData: CreateTransactionData): void {
    this.clearMessages();
    // 'paystack' is not in the PaymentMethod type yet so cast it
    if ((formData.payment_method as string) === 'paystack') {
      this.handlePaystackPayment(formData);
    } else {
      this.handleManualPayment(formData);
    }
  }

  private handlePaystackPayment(formData: CreateTransactionData): void {
    this.submitting = true;
    const profile = this.authService.currentProfile;

    if (!profile?.church_id) {
      this.errorMessage = 'Church information not found. Please log out and back in.';
      this.submitting = false;
      return;
    }

    this.paystackService.initializePayment({
      amount: formData.amount,
      category_id: formData.category_id,
      church_id: profile.church_id,
      notes: formData.notes,
    })
    .then((result) => {
      sessionStorage.setItem('paystack_pending_ref', result.reference);
      // Hard redirect to Paystack hosted checkout page
      window.location.href = result.authorization_url;
    })
    .catch((err) => {
      this.errorMessage = err.message || 'Failed to initialize payment. Please try again.';
      this.submitting = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  private handleManualPayment(formData: CreateTransactionData): void {
    this.submitting = true;
    this.givingService.submitGiving(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (txn) => {
          this.successMessage = `Recorded successfully! Reference: ${txn.transaction_reference}`;
          this.submitting = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => this.router.navigate(['/main/my-giving']), 2000);
        },
        error: () => {
          this.errorMessage = 'Failed to submit payment. Please try again.';
          this.submitting = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      });
  }

  onFormCancel(): void { this.router.navigate(['/main/my-giving']); }
  private clearMessages(): void { this.successMessage = ''; this.errorMessage = ''; }
}


