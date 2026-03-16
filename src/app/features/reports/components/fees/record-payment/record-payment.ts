
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { SupabaseService } from '../../../../../core/services/supabase';
import {
  Student, StudentFee, TERMS, PAYMENT_METHODS
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

  // Payment form
  paymentForm = {
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    notes: '',
  };

  // Per-fee payment amounts
  feePayments: { fee: StudentFee; amount: number; selected: boolean }[] = [];

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
    const year = new Date().getFullYear();
    this.selectedYear = `${year}/${year + 1}`;
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
    ];

    this.loadStudent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStudent(): void {
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
    this.schoolService
      .getStudentFees(this.studentId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          // Only show unpaid/partial fees
          this.fees = fees.filter((f) => f.status !== 'paid');
          this.feePayments = this.fees.map((f) => ({
            fee: f,
            amount: f.amount_due - f.amount_paid, // default to full balance
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

  get totalPayment(): number {
    return this.feePayments
      .filter((fp) => fp.selected)
      .reduce((s, fp) => s + Number(fp.amount), 0);
  }

  get selectedFeeItems(): any[] {
    return this.feePayments
      .filter((fp) => fp.selected && fp.amount > 0)
      .map((fp) => ({
        feeId: fp.fee.id,
        feeName: fp.fee.fee_name,
        amount: Number(fp.amount),
      }));
  }

  onSubmit(): void {
    if (this.selectedFeeItems.length === 0) {
      this.errorMessage = 'Please select at least one fee and enter an amount';
      return;
    }

    if (this.totalPayment <= 0) {
      this.errorMessage = 'Total payment amount must be greater than 0';
      return;
    }

    // Validate amounts don't exceed balance
    for (const fp of this.feePayments.filter((f) => f.selected)) {
      const balance = fp.fee.amount_due - fp.fee.amount_paid;
      if (fp.amount > balance) {
        this.errorMessage = `Amount for "${fp.fee.fee_name}" exceeds outstanding balance`;
        return;
      }
    }

    this.processing = true;
    this.errorMessage = '';

    const churchId = this.authService.getChurchId() || '';

    // Generate receipt number then record payment
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

  cancel(): void {
    this.router.navigate(['main/reports/students', this.studentId]);
  }

  getFullName(): string {
    if (!this.student) return '';
    return `${this.student.first_name} ${this.student.last_name}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }
}
