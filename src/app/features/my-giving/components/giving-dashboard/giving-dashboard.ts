// src/app/features/my-giving/pages/giving-dashboard/giving-dashboard.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  GivingSummary,
  GivingTransaction,
} from '../../../../models/giving.model';
import { GivingService } from '../../services/giving';

@Component({
  selector: 'app-giving-dashboard',
  standalone: false,
  templateUrl: './giving-dashboard.html',
  styleUrl: './giving-dashboard.scss',
})
export class GivingDashboard implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  summaryLoading = false;
  transactionsLoading = false;

  summary: GivingSummary = {
    total_giving: 0,
    total_tithes: 0,
    total_offerings: 0,
    total_seeds: 0,
    total_transactions: 0,
    currency: 'GHS',
  };

  recentTransactions: GivingTransaction[] = [];
  fiscalYear = new Date().getFullYear();

  constructor(
    private givingService: GivingService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadGivingData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadGivingData(): void {
    this.loading = true;
    this.loadGivingSummary();
    this.loadRecentTransactions();
  }

  private loadGivingSummary(): void {
    this.summaryLoading = true;
    this.givingService
      .getMyGivingSummary(this.fiscalYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.summaryLoading = false;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading summary:', err);
          this.summaryLoading = false;
          this.loading = false;
        },
      });
  }

  navigateToHistory(): void {
    this.router.navigate(['/main/my-giving/history']);
  }

  private loadRecentTransactions(): void {
    this.transactionsLoading = true;
    this.givingService
      .getMyGivingHistory(10)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (transactions) => {
          this.recentTransactions = transactions;
          this.transactionsLoading = false;
        },
        error: (err) => {
          console.error('Error loading transactions:', err);
          this.transactionsLoading = false;
        },
      });
  }

  navigateToMakePayment(): void {
    this.router.navigate(['/main/my-giving/make-payment']);
  }

  getGivingTypeIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();

    if (name.includes('tithe')) return 'ri-hand-heart-line';
    if (name.includes('offering')) return 'ri-gift-line';
    if (name.includes('seed')) return 'ri-seedling-line';
    if (name.includes('building')) return 'ri-building-line';
    if (name.includes('special')) return 'ri-star-line';

    return 'ri-money-dollar-circle-line';
  }
}



