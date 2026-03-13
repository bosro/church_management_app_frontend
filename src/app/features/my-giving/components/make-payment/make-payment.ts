// src/app/features/my-giving/pages/make-payment/make-payment.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  GivingCategory,
  CreateTransactionData,
} from '../../../../models/giving.model';
import { GivingService } from '../../services/giving';

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
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCategories(): void {
    this.categoriesLoading = true;
    this.givingService
      .getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.categoriesLoading = false;
        },
        error: (err) => {
          console.error('Error loading categories:', err);
          this.errorMessage = 'Failed to load giving categories';
          this.categoriesLoading = false;
        },
      });
  }

  onFormSubmit(formData: CreateTransactionData): void {
    this.clearMessages();
    this.submitting = true;

    this.givingService
      .submitGiving(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (transaction) => {
          this.successMessage = `Payment submitted successfully! Reference: ${transaction.transaction_reference}`;
          this.submitting = false;
          this.scrollToTop();

          // Navigate back to dashboard after 2 seconds
          setTimeout(() => {
            this.router.navigate(['/main/my-giving']);
          }, 2000);
        },
        error: (err) => {
          console.error('Error submitting payment:', err);
          this.errorMessage = 'Failed to submit payment. Please try again.';
          this.submitting = false;
          this.scrollToTop();
        },
      });
  }

  onFormCancel(): void {
    this.router.navigate(['/main/my-giving']);
  }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
