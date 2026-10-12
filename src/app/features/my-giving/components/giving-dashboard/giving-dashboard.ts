// src/app/features/my-giving/pages/giving-dashboard/giving-dashboard.component.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  GivingSummary,
  GivingTransaction,
} from '../../../../models/giving.model';
import { GivingService, MyPledge } from '../../services/giving';
import { PaystackService } from '../../services/paystack';

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

  // ── My pledges (pay online) ──
  pledges: MyPledge[] = [];
  pledgesLoading = false;
  payingPledge: MyPledge | null = null;
  payAmount = '';
  payError = '';
  payBusy = false;

  constructor(
    private givingService: GivingService,
    private router: Router,
    private paystackService: PaystackService,
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
    this.loadPledges();
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

  // ── My pledges ──────────────────────────────────────────────────────────────

  private loadPledges(): void {
    this.pledgesLoading = true;
    this.givingService
      .getMyPledges()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pledges) => {
          this.pledges = pledges;
          this.pledgesLoading = false;
        },
        error: () => {
          this.pledges = []; // no pledges card if it cannot be loaded
          this.pledgesLoading = false;
        },
      });
  }

  /** Pledges that still have a balance */
  get openPledges(): MyPledge[] {
    return this.pledges.filter((p) => !p.is_fulfilled && this.balanceOf(p) > 0);
  }

  balanceOf(p: MyPledge): number {
    return Math.max(0, Math.round((Number(p.pledge_amount) - Number(p.amount_paid || 0)) * 100) / 100);
  }

  progressOf(p: MyPledge): number {
    const total = Number(p.pledge_amount) || 0;
    return total > 0 ? Math.min(100, Math.round((Number(p.amount_paid || 0) / total) * 100)) : 0;
  }

  openPay(p: MyPledge): void {
    this.payingPledge = p;
    this.payAmount = this.balanceOf(p).toFixed(2);
    this.payError = '';
  }

  closePay(): void {
    if (this.payBusy) return;
    this.payingPledge = null;
    this.payError = '';
  }

  async startPledgePayment(): Promise<void> {
    if (!this.payingPledge || this.payBusy) return;
    const amount = Math.round(parseFloat(this.payAmount) * 100) / 100;
    const balance = this.balanceOf(this.payingPledge);

    if (!Number.isFinite(amount) || amount <= 0) {
      this.payError = 'Enter a valid amount.';
      return;
    }
    if (amount > balance + 0.005) {
      this.payError = `Amount cannot be more than your balance (${this.payingPledge.currency} ${balance.toFixed(2)}).`;
      return;
    }

    this.payBusy = true;
    this.payError = '';
    try {
      const result = await this.paystackService.initializePledgePayment({
        pledge_id: this.payingPledge.id,
        amount,
        mode: 'self',
      });
      sessionStorage.setItem('paystack_pending_ref', result.reference);
      window.location.href = result.authorization_url; // off to Paystack
    } catch (e: any) {
      this.payError = e?.message || 'Could not start the payment. Please try again.';
      this.payBusy = false;
    }
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









