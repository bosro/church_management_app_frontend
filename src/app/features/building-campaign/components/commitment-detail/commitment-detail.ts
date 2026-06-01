
// src/app/features/building-campaign/components/commitment-detail/commitment-detail.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BuildingCommitment, BuildingCommitmentPayment } from '../../../../models/building-campaign.model';
import { BuildingCampaignService } from '../../services/building-campaign.service';


@Component({
  selector: 'app-commitment-detail',
  standalone: false,
  templateUrl: './commitment-detail.html',
  styleUrl: './commitment-detail.scss',
})
export class CommitmentDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  commitment: BuildingCommitment | null = null;
  payments: BuildingCommitmentPayment[] = [];
  loading = true;
  loadingPayments = true;
  errorMessage = '';

  showPaymentForm = false;
  paymentForm!: FormGroup;
  submittingPayment = false;
  paymentSuccess = '';
  paymentError = '';

  showDeleteConfirm = false;
  deleting = false;

  paymentMethods = [
    'Bank Transfer — GT Bank',
    'Mobile Money (MTN)',
    'Mobile Money (Vodafone)',
    'Cash / Offering Box',
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private campaignService: BuildingCampaignService,
  ) {}

  ngOnInit(): void {
    this.initPaymentForm();
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadCommitment(id);
    this.loadPayments(id);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private initPaymentForm(): void {
    const today = new Date().toISOString().split('T')[0];
    this.paymentForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      payment_date: [today, Validators.required],
      payment_method: [''],
      reference: [''],
      notes: [''],
    });
  }

  loadCommitment(id: string): void {
    this.loading = true;
    this.campaignService.getCommitmentById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => { this.commitment = c; this.loading = false; },
        error: (err) => { this.errorMessage = err.message; this.loading = false; },
      });
  }

  loadPayments(id: string): void {
    this.loadingPayments = true;
    this.campaignService.getPayments(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (p) => { this.payments = p; this.loadingPayments = false; },
        error: () => { this.loadingPayments = false; },
      });
  }

  recordPayment(): void {
    if (this.paymentForm.invalid) { this.paymentForm.markAllAsTouched(); return; }
    if (!this.commitment) return;

    const v = this.paymentForm.value;
    const amount = +v.amount;
    const outstanding = this.commitment.total_pledge_amount - this.commitment.amount_paid;

    if (amount > outstanding) {
      this.paymentError = `Amount exceeds outstanding balance of ${this.formatCurrency(outstanding)}`;
      return;
    }

    this.submittingPayment = true;
    this.paymentError = '';
    this.paymentSuccess = '';

    this.campaignService.recordPayment(this.commitment.id, {
      amount,
      payment_date: v.payment_date,
      payment_method: v.payment_method || null,
      reference: v.reference || null,
      notes: v.notes || null,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.submittingPayment = false;
        this.paymentSuccess = 'Payment recorded successfully!';
        this.showPaymentForm = false;
        this.paymentForm.reset({ payment_date: new Date().toISOString().split('T')[0] });
        // Reload
        this.loadCommitment(this.commitment!.id);
        this.loadPayments(this.commitment!.id);
      },
      error: (err) => {
        this.submittingPayment = false;
        this.paymentError = err.message || 'Failed to record payment.';
      },
    });
  }

  deletePayment(paymentId: string): void {
    if (!confirm('Remove this payment record?')) return;
    this.campaignService.deletePayment(paymentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadCommitment(this.commitment!.id);
          this.loadPayments(this.commitment!.id);
        },
        error: (err) => { this.errorMessage = err.message; },
      });
  }

  deleteCommitment(): void {
    if (!this.commitment) return;
    this.deleting = true;
    this.campaignService.deleteCommitment(this.commitment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.router.navigate(['/main/building-campaign']),
        error: (err) => { this.errorMessage = err.message; this.deleting = false; this.showDeleteConfirm = false; },
      });
  }

  goBack(): void { this.router.navigate(['/main/building-campaign']); }

  // ── Helpers ──────────────────────────────────────────────────
  get pledgerName(): string {
    if (!this.commitment) return '';
    if (this.commitment.member)
      return `${this.commitment.member.first_name} ${this.commitment.member.last_name}`;
    return this.commitment.visitor_name || 'N/A';
  }

  get pledgerContact(): string {
    if (!this.commitment) return '';
    return this.commitment.member?.member_number || this.commitment.visitor_contact || '—';
  }

  get progressPct(): number {
    if (!this.commitment?.total_pledge_amount) return 0;
    return Math.min(100, Math.round((this.commitment.amount_paid / this.commitment.total_pledge_amount) * 100));
  }

  get outstanding(): number {
    if (!this.commitment) return 0;
    return this.commitment.total_pledge_amount - this.commitment.amount_paid;
  }

  // Projected schedule: list of instalment due dates/amounts
  get schedule(): { period: number; amount: number; label: string }[] {
    if (!this.commitment) return [];
    const items = [];
    for (let i = 1; i <= this.commitment.instalment_count; i++) {
      items.push({
        period: i,
        amount: this.commitment.instalment_amount,
        label: `${this.commitment.instalment_frequency === 'weekly' ? 'Week' : 'Month'} ${i}`,
      });
    }
    return items;
  }

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(n || 0);
  }

  formatDate(s: string): string {
    return new Date(s).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
