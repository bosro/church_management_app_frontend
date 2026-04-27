import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  FeedingService,
  ALL_TIERS,
  TIER_LABELS,
  FeedingTier,
  DayEntry,
} from '../../../services/feeding.service';
import { AuthService } from '../../../../../core/services/auth';
import {
  TERMS,
  generateAcademicYears,
  currentAcademicYear,
} from '../../../../../models/school.model';
import { FeedingFilterService } from '../../../services/feeding-filter.service';

interface SettingRow {
  id?: string;
  scope: 'school' | 'tier' | 'class';
  label: string;
  tier?: FeedingTier;
  classId?: string;
  className?: string;
  classTier?: string;
  dailyAmount: number;
  editing: boolean;
  editingAmount: number;
  saving: boolean;
}

@Component({
  selector: 'app-feeding-admin',
  standalone: false,
  templateUrl: './feeding-admin.html',
  styleUrl: './feeding-admin.scss',
})
export class FeedingAdmin implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  churchId = '';
  selectedTerm = '';
  selectedYear = '';
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Settings
  settingRows: SettingRow[] = [];
  loadingSettings = false;

  // Classes (for per-class override UI)
  classes: any[] = [];
  addOverrideClassId = '';
  addOverrideAmount = 0;
  addingOverride = false;
  showAddOverride = false;

  // Records
  payments: any[] = [];
  loadingPayments = false;

  // Summary
  dailySummary: any = null;

  // Selected date for records view
  selectedDate = new Date().toISOString().split('T')[0];

  // Edit payment
  showEditPaymentModal = false;
  editingPayment: any = null;
  editPaymentAmount = 0;
  editPaymentNotes = '';
  editPaymentDate = '';
  processingPaymentEdit = false;

  // Student detail modal
  showStudentDetailModal = false;
  studentDetailLoading = false;
  studentDetail: any = null; // result of getStudentTermDetail

  // Public link
  publicLink = '';
  linkCopied = false;

  errorMessage = '';
  successMessage = '';

  tierLabels = TIER_LABELS;
  allTiers = ALL_TIERS;

  constructor(
    private feedingService: FeedingService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    public router: Router,
    private feedingFilter: FeedingFilterService,
  ) {}

  ngOnInit(): void {
    this.churchId = this.authService.getChurchId() || '';
    this.publicLink = `${window.location.origin}/public/feeding-fees/${this.churchId}`;

    // Load persisted term/year
    this.selectedTerm = this.feedingFilter.term;
    this.selectedYear = this.feedingFilter.year;

    this.loadClasses();
    this.loadSettings();
    this.loadPayments();
    this.loadDailySummary();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Classes ───────────────────────────────────────────────

  loadClasses(): void {
    this.feedingService
      .getClasses(this.churchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => {
          this.classes = c;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Settings ──────────────────────────────────────────────

  loadSettings(): void {
    this.loadingSettings = true;
    this.feedingService
      .getAllSettings(this.churchId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.buildSettingRows(rows);
          this.loadingSettings = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingSettings = false;
          this.cdr.markForCheck();
        },
      });
  }

  private buildSettingRows(dbRows: any[]): void {
    const findAmount = (tier?: string, classId?: string): number => {
      const match = dbRows.find((r: any) => {
        if (classId) return r.class_id === classId;
        if (tier) return r.tier === tier && !r.class_id;
        return !r.tier && !r.class_id;
      });
      return match ? Number(match.daily_amount) : 0;
    };

    const findRow = (tier?: string, classId?: string): any =>
      dbRows.find((r: any) => {
        if (classId) return r.class_id === classId;
        if (tier) return r.tier === tier && !r.class_id;
        return !r.tier && !r.class_id;
      });

    const rows: SettingRow[] = [];

    // 1. Tier rows (always shown)
    for (const tier of ALL_TIERS) {
      const dbRow = findRow(tier);
      rows.push({
        id: dbRow?.id,
        scope: 'tier',
        label: TIER_LABELS[tier],
        tier,
        dailyAmount: findAmount(tier),
        editing: false,
        editingAmount: findAmount(tier),
        saving: false,
      });
    }

    // 2. Class override rows (only rows that exist in DB with a class_id)
    const classOverrides = dbRows.filter((r: any) => !!r.class_id);
    for (const co of classOverrides) {
      rows.push({
        id: co.id,
        scope: 'class',
        label: co.class?.name || 'Unknown class',
        classId: co.class_id,
        className: co.class?.name,
        classTier: co.class?.tier,
        dailyAmount: Number(co.daily_amount),
        editing: false,
        editingAmount: Number(co.daily_amount),
        saving: false,
      });
    }

    this.settingRows = rows;
  }

  startEdit(row: SettingRow): void {
    row.editingAmount = row.dailyAmount;
    row.editing = true;
    this.cdr.markForCheck();
  }

  cancelEdit(row: SettingRow): void {
    row.editing = false;
    this.cdr.markForCheck();
  }

  saveSetting(row: SettingRow): void {
    if (!row.editingAmount || row.editingAmount <= 0) return;
    row.saving = true;

    this.feedingService
      .saveSetting(
        this.churchId,
        this.selectedYear,
        this.selectedTerm,
        row.editingAmount,
        row.scope,
        row.tier,
        row.classId,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved) => {
          row.id = saved?.id || row.id;
          row.dailyAmount = row.editingAmount;
          row.editing = false;
          row.saving = false;
          this.showSuccess('Rate saved successfully');
          this.cdr.markForCheck();
        },
        error: (err) => {
          row.saving = false;
          this.errorMessage = err.message || 'Failed to save rate';
          this.cdr.markForCheck();
        },
      });
  }

  deleteOverride(row: SettingRow): void {
    if (!row.id) return;
    if (
      !confirm(
        `Remove override for ${row.label}? It will fall back to its tier rate.`,
      )
    )
      return;

    this.feedingService
      .deleteSetting(row.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.settingRows = this.settingRows.filter((r) => r !== row);
          this.showSuccess('Override removed');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to remove override';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Add class override ────────────────────────────────────

  get availableClassesForOverride(): any[] {
    const overriddenIds = this.settingRows
      .filter((r) => r.scope === 'class')
      .map((r) => r.classId);
    return this.classes.filter((c) => !overriddenIds.includes(c.id));
  }

  addClassOverride(): void {
    if (
      !this.addOverrideClassId ||
      !this.addOverrideAmount ||
      this.addOverrideAmount <= 0
    )
      return;
    this.addingOverride = true;

    const selectedClass = this.classes.find(
      (c) => c.id === this.addOverrideClassId,
    );

    this.feedingService
      .saveSetting(
        this.churchId,
        this.selectedYear,
        this.selectedTerm,
        this.addOverrideAmount,
        'class',
        undefined,
        this.addOverrideClassId,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved) => {
          this.settingRows.push({
            id: saved?.id,
            scope: 'class',
            label: selectedClass?.name || 'Unknown',
            classId: this.addOverrideClassId,
            className: selectedClass?.name,
            classTier: selectedClass?.tier,
            dailyAmount: this.addOverrideAmount,
            editing: false,
            editingAmount: this.addOverrideAmount,
            saving: false,
          });
          this.addOverrideClassId = '';
          this.addOverrideAmount = 0;
          this.addingOverride = false;
          this.showAddOverride = false;
          this.showSuccess('Class override added');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.addingOverride = false;
          this.errorMessage = err.message || 'Failed to add override';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Records ───────────────────────────────────────────────

  onFilterChange(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
    this.loadSettings();
    this.loadPayments();
    this.loadDailySummary();
  }

  onDateChange(): void {
    this.loadPayments();
    this.loadDailySummary();
  }

  loadPayments(): void {
    this.loadingPayments = true;
    this.feedingService
      .getPayments(
        this.churchId,
        this.selectedYear,
        this.selectedTerm,
        this.selectedDate || undefined,
      )
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
    this.feedingService
      .getDailySummary(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.dailySummary = s;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Edit payment (admin) ──────────────────────────────────

  openEditPaymentModal(payment: any): void {
    this.editingPayment = payment;
    this.editPaymentAmount = Number(payment.amount_paid);
    this.editPaymentNotes = payment.notes || '';
    this.editPaymentDate = payment.payment_date;
    this.showEditPaymentModal = true;
    this.cdr.markForCheck();
  }

  closeEditPaymentModal(): void {
    this.showEditPaymentModal = false;
    this.editingPayment = null;
    this.editPaymentAmount = 0;
    this.editPaymentNotes = '';
    this.editPaymentDate = '';
  }

  submitPaymentEdit(): void {
    if (
      !this.editingPayment ||
      !this.editPaymentAmount ||
      this.editPaymentAmount <= 0
    )
      return;
    this.processingPaymentEdit = true;

    // Resolve days covered from the student's class rate
    const studentClass = this.editingPayment.student?.class;
    const rate = this.resolveRateForDisplay(
      studentClass?.id,
      studentClass?.tier,
    );
    const daysCovered =
      rate > 0
        ? Math.max(1, Math.floor(this.editPaymentAmount / rate))
        : this.editingPayment.days_covered;

    this.feedingService
      .updatePayment(this.editingPayment.id, {
        amount_paid: this.editPaymentAmount,
        days_covered: daysCovered,
        notes: this.editPaymentNotes || undefined,
        payment_date: this.editPaymentDate,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const idx = this.payments.findIndex((p) => p.id === updated.id);
          if (idx >= 0) {
            this.payments[idx] = { ...this.payments[idx], ...updated };
          }
          this.processingPaymentEdit = false;
          this.closeEditPaymentModal();
          this.showSuccess('Payment updated');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingPaymentEdit = false;
          this.errorMessage = err.message || 'Failed to update payment';
          this.cdr.markForCheck();
        },
      });
  }

  deletePayment(payment: any): void {
    if (
      !confirm(
        `Delete this payment of ${this.formatCurrency(payment.amount_paid)}? This cannot be undone.`,
      )
    )
      return;
    this.feedingService
      .deletePayment(payment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.payments = this.payments.filter((p) => p.id !== payment.id);
          this.showSuccess('Payment deleted');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Student detail modal ─────────────────────────────────

  async openStudentDetail(payment: any): Promise<void> {
    const student = payment.student;
    if (!student) return;
    this.studentDetailLoading = true;
    this.showStudentDetailModal = true;
    this.studentDetail = null;
    this.cdr.markForCheck();

    try {
      const classId = student.class?.id;
      const classTier = student.class?.tier;
      const rate = this.resolveRateForDisplay(classId, classTier);

      this.studentDetail = await this.feedingService.getStudentTermDetail(
        this.churchId,
        student.id,
        this.selectedYear,
        this.selectedTerm,
        rate,
      );
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load student details';
    } finally {
      this.studentDetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  closeStudentDetailModal(): void {
    this.showStudentDetailModal = false;
    this.studentDetail = null;
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Quick lookup of resolved rate from already-loaded settingRows (no DB call) */
  resolveRateForDisplay(classId?: string, classTier?: string): number {
    if (classId) {
      const row = this.settingRows.find(
        (r) => r.scope === 'class' && r.classId === classId,
      );
      if (row) return row.dailyAmount;
    }
    if (classTier) {
      const row = this.settingRows.find(
        (r) => r.scope === 'tier' && r.tier === classTier,
      );
      if (row) return row.dailyAmount;
    }
    const fallback = this.settingRows.find((r) => r.scope === 'school');
    return fallback?.dailyAmount ?? 0;
  }

  getTierLabel(tier: string | undefined): string {
    return tier ? (TIER_LABELS as any)[tier] || tier : '—';
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.publicLink).then(() => {
      this.linkCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.linkCopied = false;
        this.cdr.markForCheck();
      }, 2500);
    });
  }

  get totalCollectedToday(): number {
    return this.payments.reduce((s, p) => s + Number(p.amount_paid), 0);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  getStudentName(s: any): string {
    if (!s) return '—';
    return `${s.first_name} ${s.last_name}`.trim();
  }

  trackByPaymentId(_: number, p: any): string {
    return p.id;
  }
  trackByRowLabel(_: number, r: SettingRow): string {
    return r.classId || r.tier || 'school';
  }

  private showSuccess(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => {
      this.successMessage = '';
      this.cdr.markForCheck();
    }, 3000);
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }
}
