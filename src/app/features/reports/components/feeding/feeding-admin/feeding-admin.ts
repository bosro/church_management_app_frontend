import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FeedingService } from '../../../services/feeding.service';
import { AuthService } from '../../../../../core/services/auth';
import { TERMS, generateAcademicYears, currentAcademicYear } from '../../../../../models/school.model';

@Component({
  selector: 'app-feeding-admin',
  standalone: false,
  templateUrl: './feeding-admin.html',
  styleUrl: './feeding-admin.scss',
})
export class FeedingAdmin implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  churchId = '';
  selectedTerm = TERMS[0];
  selectedYear = currentAcademicYear();
  selectedDate = new Date().toISOString().split('T')[0];
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Settings
  dailyAmount = 0;
  editingAmount = 0;
  savingSettings = false;
  settingsLoaded = false;

  // Records
  payments: any[] = [];
  loadingPayments = false;

  // Summary
  dailySummary: any = null;

  // Public link
  publicLink = '';
  linkCopied = false;

  errorMessage = '';
  successMessage = '';

  constructor(
    private feedingService: FeedingService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    public router: Router,
  ) {}

  ngOnInit(): void {
    this.churchId = this.authService.getChurchId() || '';
    this.publicLink = `${window.location.origin}/public/feeding-fees/${this.churchId}`;
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAll(): void {
    this.loadSettings();
    this.loadPayments();
    this.loadDailySummary();
  }

  loadSettings(): void {
    this.feedingService.getSettings(this.churchId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.dailyAmount = s?.daily_amount || 0;
          this.editingAmount = this.dailyAmount;
          this.settingsLoaded = true;
          this.cdr.markForCheck();
        },
      });
  }

  saveSettings(): void {
    if (!this.editingAmount || this.editingAmount <= 0) return;
    this.savingSettings = true;
    this.feedingService.saveSettings(this.churchId, this.selectedYear, this.selectedTerm, this.editingAmount)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.dailyAmount = this.editingAmount;
          this.savingSettings = false;
          this.successMessage = 'Daily feeding fee saved!';
          this.cdr.markForCheck();
          setTimeout(() => { this.successMessage = ''; this.cdr.markForCheck(); }, 3000);
          // Refresh summary with new rate
          this.loadDailySummary();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to save settings';
          this.savingSettings = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadPayments(): void {
    this.loadingPayments = true;
    this.feedingService.getPayments(this.churchId, this.selectedYear, this.selectedTerm, this.selectedDate || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (p) => {
          this.payments = p;
          this.loadingPayments = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingPayments = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadDailySummary(): void {
    if (!this.selectedDate) return;
    this.feedingService.getDailySummary(this.churchId, this.selectedDate, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.dailySummary = s;
          this.cdr.markForCheck();
        },
      });
  }

  onFilterChange(): void {
    this.loadAll();
  }

  onDateChange(): void {
    this.loadPayments();
    this.loadDailySummary();
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.publicLink).then(() => {
      this.linkCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.linkCopied = false; this.cdr.markForCheck(); }, 2500);
    });
  }

  get totalCollectedToday(): number {
    return this.payments.reduce((s, p) => s + Number(p.amount_paid), 0);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  }

  getStudentName(s: any): string {
    if (!s) return '—';
    return `${s.first_name} ${s.last_name}`.trim();
  }

  trackByPaymentId(_: number, p: any): string {
    return p.id;
  }
}
