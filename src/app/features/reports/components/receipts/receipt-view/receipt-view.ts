
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { SupabaseService } from '../../../../../core/services/supabase';
import { FeePayment } from '../../../../../models/school.model';

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

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.receiptNumber = this.route.snapshot.paramMap.get('receiptNumber') || '';
    this.loadChurchInfo();
    this.loadPayment();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadChurchInfo(): void {
    const churchId = this.authService.getChurchId();
    if (!churchId) return;

    this.supabase.client
      .from('churches')
      .select('name, logo_url, address, phone, city')
      .eq('id', churchId)
      .single()
      .then(({ data }) => {
        if (data) {
          this.churchName = data.name || '';
          this.churchLogo = data.logo_url || '';
          this.churchAddress = [data.address, data.city]
            .filter(Boolean).join(', ');
          this.churchPhone = data.phone || '';
        }
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
        },
        error: (err) => {
          this.errorMessage = err.message || 'Receipt not found';
          this.loading = false;
        },
      });
  }

  printReceipt(): void {
    window.print();
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
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }

  numberToWords(amount: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
      'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
      'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
      'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (amount === 0) return 'Zero';

    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] +
        (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' +
        (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
      if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Thousand' +
        (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
      return convert(Math.floor(n / 1000000)) + ' Million' +
        (n % 1000000 !== 0 ? ' ' + convert(n % 1000000) : '');
    };

    const cedis = Math.floor(amount);
    const pesewas = Math.round((amount - cedis) * 100);
    let result = convert(cedis) + ' Ghana Cedis';
    if (pesewas > 0) result += ' and ' + convert(pesewas) + ' Pesewas';
    return result + ' Only';
  }
}
