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

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private supabase: SupabaseService,
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

  loadPayment(): void {
    this.loading = true;
    this.schoolService
      .getPaymentByReceiptNumber(this.receiptNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payment) => {
          this.payment = payment;
          this.loading = false;
          // After loading the receipt, fetch ALL payments for same student/term/year
          if (payment?.student_id) {
            this.loadAllStudentPayments(
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
    if (!this.payment?.fee_items) return 0;
    return this.payment.fee_items
      .filter((i: any) => !i.is_arrears)
      .reduce((sum: number, i: any) => sum + Number(i.amount_due || 0), 0);
  }

  /** Remaining balance across all fees on this receipt */
  getTotalBalance(): number {
    if (!this.payment?.fee_items) return 0;
    const totalDue = this.payment.fee_items
      .filter((i: any) => !i.is_arrears)
      .reduce((sum: number, i: any) => sum + Number(i.amount_due || 0), 0);
    const totalPaid = this.payment.fee_items
      .filter((i: any) => !i.is_arrears)
      .reduce(
        (sum: number, i: any) => sum + Number(i.amount_paid_total || 0),
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
