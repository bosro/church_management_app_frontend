// ═══════════════════════════════════════════════════════════════════════════
// FILE 1: record-payment.ts  — FULL REPLACEMENT
// Path: src/app/features/reports/components/fees/record-payment/record-payment.ts
// ═══════════════════════════════════════════════════════════════════════════

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { SupabaseService } from '../../../../../core/services/supabase';
import {
  Student,
  StudentFee,
  TERMS,
  PAYMENT_METHODS,
  currentAcademicYear,
  generateAcademicYears,
} from '../../../../../models/school.model';

@Component({
  selector: 'app-record-payment',
  standalone: false,
  templateUrl: './record-payment.html',
  styleUrl: './record-payment.scss',
})
export class RecordPayment implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  student: Student | null = null;
  fees: StudentFee[] = [];
  loading = true;
  processing = false;
  errorMessage = '';
  successMessage = '';

  selectedTerm = TERMS[0];
  selectedYear = '';
  terms = TERMS;
  academicYears: string[] = [];
  paymentMethods = PAYMENT_METHODS;

  // ── Payment form ──────────────────────────────────────
  paymentForm = {
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    received_by: '', // NEW: who is recording the payment
    notes: '',
  };

  // Per-fee payment amounts
  feePayments: { fee: StudentFee; amount: number; selected: boolean }[] = [];

  // ── NEW: Arrears ──────────────────────────────────────
  includeArrears = false;
  arrearsAmount = 0;
  arrearsDescription = '';

  // ── NEW: Payment history modal ────────────────────────
  showHistoryModal = false;
  selectedFeeHistory: StudentFee | null = null;
  feePaymentHistory: any[] = [];
  loadingHistory = false;

  // Add these properties
  showAssignFeeModal = false;
  availableFeeStructures: any[] = [];
  loadingFeeStructures = false;
  assigningFee = false;
  selectedFeeStructureToAssign = '';

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private supabase: SupabaseService,
    public router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.school.fees) {
      this.router.navigate(['/unauthorized']);
      return;
    }

    this.studentId = this.route.snapshot.paramMap.get('studentId') || '';
    this.academicYears = generateAcademicYears();
    this.selectedYear = currentAcademicYear();

    // Pre-fill received_by with current user's name
    this.paymentForm.received_by =
      this.authService.currentProfile?.full_name || '';

    this.loadStudent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStudent(): void {
    // ✅ FIX 1b: Reset everything when navigating between students
    this.student = null;
    this.fees = [];
    this.feePayments = [];
    this.errorMessage = '';

    this.schoolService
      .getStudentById(this.studentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (student) => {
          this.student = student;
          this.loadFees();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Student not found';
          this.loading = false;
        },
      });
  }

  loadFees(): void {
    this.loading = true;
    // ✅ FIX 1: Clear immediately so stale data never shows
    this.fees = [];
    this.feePayments = [];

    this.schoolService
      .getStudentFees(this.studentId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.fees = fees;
          this.feePayments = fees
            .filter((f) => f.status !== 'paid')
            .map((f) => ({
              fee: f,
              amount: Number((f.amount_due - f.amount_paid).toFixed(2)),
              selected: true,
            }));
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load fees';
          this.loading = false;
        },
      });
  }

  onTermChange(): void {
    this.loadFees();
  }

  // ── Computed ──────────────────────────────────────────

  get totalFeesDue(): number {
    // This is the TOTAL BILLED (amount_due), not remaining
    return this.fees.reduce((s, f) => s + Number(f.amount_due), 0);
  }

  get totalFeesPaid(): number {
    return this.fees.reduce((s, f) => s + Number(f.amount_paid), 0);
  }

  get totalFeesBalance(): number {
    return this.totalFeesDue - this.totalFeesPaid;
  }

  get selectedFeePaymentTotal(): number {
    return this.feePayments
      .filter((fp) => fp.selected)
      .reduce((s, fp) => s + Number(fp.amount), 0);
  }

  get totalPayment(): number {
    const arrears = this.includeArrears ? Number(this.arrearsAmount) : 0;
    return this.selectedFeePaymentTotal + arrears;
  }

  get selectedFeeItems(): any[] {
    const items: any[] = this.feePayments
      .filter((fp) => fp.selected && fp.amount > 0)
      .map((fp) => ({
        feeId: fp.fee.id as string | null,
        feeName: fp.fee.fee_name,
        amount: Number(fp.amount),
      }));

    if (this.includeArrears && this.arrearsAmount > 0) {
      items.push({
        feeId: null as string | null,
        feeName: this.arrearsDescription || 'Arrears (Previous Balance)',
        amount: Number(this.arrearsAmount),
        is_arrears: true,
      } as any);
    }

    return items;
  }

  // ── Payment History ────────────────────────────────────

  openPaymentHistory(fee: StudentFee, event: Event): void {
    event.stopPropagation();
    this.selectedFeeHistory = fee;
    this.showHistoryModal = true;
    this.loadFeePaymentHistory(fee.id);
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
    this.selectedFeeHistory = null;
    this.feePaymentHistory = [];
  }

  loadFeePaymentHistory(feeId: string): void {
    this.loadingHistory = true;
    this.schoolService
      .getFeePaymentHistory(feeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => {
          this.feePaymentHistory = history;
          this.loadingHistory = false;
        },
        error: () => {
          this.loadingHistory = false;
        },
      });
  }

  // ── Submit ─────────────────────────────────────────────

  onSubmit(): void {
    if (
      this.selectedFeeItems.filter((i) => !i.is_arrears).length === 0 &&
      !this.includeArrears
    ) {
      this.errorMessage = 'Please select at least one fee and enter an amount';
      return;
    }

    if (this.totalPayment <= 0) {
      this.errorMessage = 'Total payment amount must be greater than 0';
      return;
    }

    // Validate amounts don't exceed balance
    for (const fp of this.feePayments.filter((f) => f.selected)) {
      const balance = Number(fp.fee.amount_due) - Number(fp.fee.amount_paid);
      if (Number(fp.amount) > balance + 0.01) {
        // small tolerance for float rounding
        this.errorMessage = `Amount for "${fp.fee.fee_name}" exceeds outstanding balance of ${this.formatCurrency(balance)}`;
        return;
      }
    }

    if (
      this.includeArrears &&
      (!this.arrearsAmount || this.arrearsAmount <= 0)
    ) {
      this.errorMessage = 'Please enter a valid arrears amount';
      return;
    }

    this.processing = true;
    this.errorMessage = '';

    const churchId = this.authService.getChurchId() || '';

    // Generate receipt number ONCE then record all fee payments atomically
    this.supabase.client
      .rpc('generate_receipt_number', { p_church_id: churchId })
      .then(({ data: receiptNumber, error }) => {
        if (error) {
          this.errorMessage = error.message;
          this.processing = false;
          return;
        }

        this.schoolService
          .recordPaymentWithReceipt(
            {
              studentId: this.studentId,
              amount: this.totalPayment,
              paymentMethod: this.paymentForm.payment_method,
              paymentDate: this.paymentForm.payment_date,
              academicYear: this.selectedYear,
              term: this.selectedTerm,
              feeItems: this.selectedFeeItems,
              notes: this.paymentForm.notes,
              receivedBy: this.paymentForm.received_by,
            },
            receiptNumber,
          )
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.successMessage = `Payment recorded! Receipt: ${receiptNumber}`;
              this.processing = false;
              setTimeout(() => {
                this.router.navigate(['main/reports/receipts', receiptNumber]);
              }, 1500);
            },
            error: (err) => {
              this.errorMessage = err.message || 'Failed to record payment';
              this.processing = false;
            },
          });
      });
  }

  // Add these methods
  openAssignFeeModal(): void {
    this.showAssignFeeModal = true;
    this.selectedFeeStructureToAssign = '';
    this.loadAvailableFeeStructures();
  }

  closeAssignFeeModal(): void {
    this.showAssignFeeModal = false;
    this.selectedFeeStructureToAssign = '';
  }

  loadAvailableFeeStructures(): void {
    this.loadingFeeStructures = true;
    this.schoolService
      .getAllFeeStructuresForAssignment(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (structures) => {
          // Filter out fees already assigned to this student
          const assignedIds = this.fees.map((f) => f.fee_structure_id);
          this.availableFeeStructures = structures.filter(
            (s) => !assignedIds.includes(s.id),
          );
          this.loadingFeeStructures = false;
        },
        error: () => {
          this.loadingFeeStructures = false;
        },
      });
  }

  assignFeeToStudent(): void {
    if (!this.selectedFeeStructureToAssign) return;
    this.assigningFee = true;
    const churchId = this.authService.getChurchId() || '';

    this.schoolService
      .assignFeeToStudent(
        this.studentId,
        this.selectedFeeStructureToAssign,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.assigningFee = false;
          this.closeAssignFeeModal();
          this.loadFees(); // Reload fees to show newly assigned one
          this.successMessage = 'Fee assigned successfully!';
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to assign fee';
          this.assigningFee = false;
        },
      });
  }
  cancel(): void {
    this.router.navigate(['main/reports/students', this.studentId]);
  }

  getFullName(): string {
    if (!this.student) return '';
    return `${this.student.first_name} ${this.student.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }
}
