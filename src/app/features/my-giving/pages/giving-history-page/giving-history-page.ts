
// src/app/features/my-giving/pages/giving-history-page/giving-history-page.component.ts

import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GivingTransaction } from '../../../../models/giving.model';
import { GivingService } from '../../services/giving';

@Component({
  selector: 'app-giving-history-page',
  standalone: false,
  templateUrl: './giving-history-page.html',
  styleUrl: './giving-history-page.scss',
})
export class GivingHistoryPage implements OnInit, OnDestroy {  // ✅ different class name
  private destroy$ = new Subject<void>();

  transactions: GivingTransaction[] = [];
  loading = false;
  errorMessage = '';

  selectedMethod = '';
  selectedYear = new Date().getFullYear();
  availableYears: number[] = [];

  paymentMethods = [
    { value: '', label: 'All Methods' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'check', label: 'Check' },
    { value: 'online', label: 'Online' },
  ];

  constructor(
    private givingService: GivingService,
    private router: Router
  ) {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      this.availableYears.push(currentYear - i);
    }
  }

  ngOnInit(): void {
    this.loadTransactions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTransactions(): void {
    this.loading = true;
    this.errorMessage = '';

    this.givingService
      .getMyGivingHistory(200)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (transactions) => {
          this.transactions = transactions;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading history:', err);
          this.errorMessage = 'Failed to load transaction history.';
          this.loading = false;
        }
      });
  }

  get filteredTransactions(): GivingTransaction[] {
    return this.transactions.filter(t => {
      const methodMatch = !this.selectedMethod || t.payment_method === this.selectedMethod;
      const yearMatch = !this.selectedYear || new Date(t.transaction_date).getFullYear() === this.selectedYear;
      return methodMatch && yearMatch;
    });
  }

  onBack(): void {
    this.router.navigate(['/main/my-giving']);
  }

  navigateToMakePayment(): void {
    this.router.navigate(['/main/my-giving/make-payment']);
  }
}


