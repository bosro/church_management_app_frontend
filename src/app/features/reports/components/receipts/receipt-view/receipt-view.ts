import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { SupabaseService } from '../../../../../core/services/supabase';
import { FeePayment } from '../../../../../models/school.model';
import { PdfBrandingService } from '../../../../../core/services/pdf-branding.service';

@Component({
  selector: 'app-receipt-view',
  standalone: false,
  templateUrl: './receipt-view.html',
  styleUrl: './receipt-view.scss',
})
export class ReceiptView implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  receiptNumber = '';
  payment: FeePayment | null = null;
  churchName = '';
  churchLogo = '';
  churchAddress = '';
  churchPhone = '';
  loading = true;
  errorMessage = '';
  successMessage = ''; // ← add
  showBrandingModal = false; // ← add
  allStudentPayments: any[] = [];
  allStudentFees: any[] = [];

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private pdfBranding: PdfBrandingService, // ← add
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.receiptNumber =
      this.route.snapshot.paramMap.get('receiptNumber') || '';
    this.loadChurchInfo();
    this.loadPayment();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadChurchInfo(): void {
    this.pdfBranding.getBranding().then((branding) => {
      this.churchName = branding.name;
      this.churchLogo = branding.logoBase64
        ? `data:${branding.logoMimeType};base64,${branding.logoBase64}`
        : '';
      this.churchAddress = branding.address || '';
      this.churchPhone = branding.phone || '';
    });
  }

  get receiptFeeItemsWithZeros(): any[] {
    if (!this.payment || !this.allStudentFees.length) {
      return this.payment?.fee_items || [];
    }

    // Build a map of what was paid in this receipt
    const paidMap = new Map<string, any>();
    (this.payment.fee_items || []).forEach((item: any) => {
      if (item.fee_name) paidMap.set(item.fee_name, item);
    });

    // Merge all assigned fees — show paid ones with amounts, unpaid ones with zero
    return this.allStudentFees.map((fee: any) => {
      const paid = paidMap.get(fee.fee_name);
      if (paid) return paid; // already in receipt with amount
      // Fee was assigned but not paid in this receipt — show as zero
      return {
        fee_name: fee.fee_name,
        amount: fee.amount_due, // total assigned fee
        amount_paid_this_receipt: 0, // nothing paid this time
        amount_due: fee.amount_due,
        amount_paid_total: fee.amount_paid,
        is_arrears: false,
        not_paid_this_receipt: true, // flag for styling
      };
    });
  }

  loadPayment(): void {
    this.loading = true;
    this.schoolService
      .getPaymentByReceiptNumber(this.receiptNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payment) => {
          this.payment = payment;
          this.loading = false;
          if (payment?.student_id) {
            this.loadAllStudentPayments(
              payment.student_id,
              payment.academic_year,
              payment.term,
            );
            // ADD THIS:
            this.loadAllStudentFeesForReceipt(
              payment.student_id,
              payment.academic_year,
              payment.term,
            );
          }
        },
        error: (err) => {
          this.errorMessage = err.message || 'Receipt not found';
          this.loading = false;
        },
      });
  }

  private loadAllStudentFeesForReceipt(
    studentId: string,
    academicYear: string,
    term: string,
  ): void {
    this.schoolService
      .getStudentFees(studentId, academicYear, term)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.allStudentFees = fees;
        },
        error: () => {
          /* non-critical */
        },
      });
  }

  private loadAllStudentPayments(
    studentId: string,
    academicYear: string,
    term: string,
  ): void {
    this.schoolService
      .getPayments({ studentId, academicYear, term }, 1, 100)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          // Sort oldest first for the history table
          this.allStudentPayments = data.sort(
            (a, b) =>
              new Date(a.payment_date).getTime() -
              new Date(b.payment_date).getTime(),
          );
        },
        error: () => {
          /* non-critical */
        },
      });
  }

  onBrandingSaved(): void {
    this.successMessage = 'Branding updated — changes apply on next print.';
    // Re-fetch so the receipt header updates immediately
    this.loadChurchInfo();
    setTimeout(() => (this.successMessage = ''), 3000);
  }

  printReceipt(): void {
    const originalTitle = document.title;
    document.title = this.churchName || 'Official Receipt';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  }

  goBack(): void {
    if (this.payment?.student_id) {
      this.router.navigate(['main/reports/students', this.payment.student_id]);
    } else {
      this.router.navigate(['main/reports/fees/students']);
    }
  }

  getStudentFullName(): string {
    const s = this.payment?.student;
    if (!s) return '';
    return `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  numberToWords(amount: number): string {
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    if (amount === 0) return 'Zero';

    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100)
        return (
          tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '')
        );
      if (n < 1000)
        return (
          ones[Math.floor(n / 100)] +
          ' Hundred' +
          (n % 100 !== 0 ? ' ' + convert(n % 100) : '')
        );
      if (n < 1000000)
        return (
          convert(Math.floor(n / 1000)) +
          ' Thousand' +
          (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '')
        );
      return (
        convert(Math.floor(n / 1000000)) +
        ' Million' +
        (n % 1000000 !== 0 ? ' ' + convert(n % 1000000) : '')
      );
    };

    const cedis = Math.floor(amount);
    const pesewas = Math.round((amount - cedis) * 100);
    let result = convert(cedis) + ' Ghana Cedis';
    if (pesewas > 0) result += ' and ' + convert(pesewas) + ' Pesewas';
    return result + ' Only';
  }

  getTotalBilled(): number {
    if (!this.allStudentFees.length) {
      // Fallback to fee_items if allStudentFees not loaded yet
      return (this.payment?.fee_items || []).reduce(
        (sum: number, i: any) => sum + Number(i.amount || 0),
        0,
      );
    }
    // Sum all assigned fees (including ones not paid this receipt)
    return this.allStudentFees.reduce(
      (sum: number, f: any) => sum + Number(f.amount_due || 0),
      0,
    );
  }

  /** Remaining balance across all fees on this receipt */
  getTotalBalance(): number {
    if (!this.allStudentFees.length) {
      // Fallback
      const totalDue = (this.payment?.fee_items || []).reduce(
        (sum: number, i: any) => sum + Number(i.amount_due || 0),
        0,
      );
      const totalPaid = (this.payment?.fee_items || []).reduce(
        (sum: number, i: any) => sum + Number(i.amount_paid_total || 0),
        0,
      );
      return Math.max(0, totalDue - totalPaid);
    }
    // Use allStudentFees for accurate total balance across all assigned fees
    const totalDue = this.allStudentFees.reduce(
      (sum: number, f: any) => sum + Number(f.amount_due || 0),
      0,
    );
    const totalPaid = this.allStudentFees.reduce(
      (sum: number, f: any) => sum + Number(f.amount_paid || 0),
      0,
    );
    return Math.max(0, totalDue - totalPaid);
  }

  /** Sum of ALL payments made by this student for this term (cumulative) */
  getCumulativePaid(): number {
    return this.allStudentPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
  }

  /** What percentage of total fees has been paid */
  getPaymentPercentage(): number {
    const billed = this.getTotalBilled();
    if (billed <= 0) return 0;
    return Math.min(100, (this.getCumulativePaid() / billed) * 100);
  }
}
