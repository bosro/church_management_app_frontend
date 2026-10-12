// src/app/features/finance/components/pledge-details/pledge-details.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../services/finance.service';
import { PaymentMethod } from '../../../models/giving.model';
import { PermissionService } from '../../../core/services/permission.service';
import { AuthService } from '../../../core/services/auth';
import { PaymentSmsService } from '../services/payment-sms.service';
import { PaystackService } from '../../my-giving/services/paystack';
import { copyToClipboard } from '../../../core/utils/copy-to-clipboard';

@Component({
  selector: 'app-pledge-details',
  standalone: false,
  templateUrl: './pledge-details.html',
  styleUrl: './pledge-details.scss',
})
export class PledgeDetails implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pledgeId: string = '';
  pledge: any = null;
  payments: any[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Payment modal
  showPaymentModal = false;
  paymentForm!: FormGroup;
  recordingPayment = false;
  sendSms = false; // tick-box: SMS confirmation to the pledger

  // ── Collect online (Paystack pay link) ──
  payMode: 'record' | 'online' = 'record';
  onlineEmail = '';
  onlineBusy = false;
  onlineError = '';
  onlineLink = '';
  onlineInfo = '';
  linkCopied = false;
  linkSmsMessage = '';

  // Payment methods
  paymentMethods: PaymentMethod[] = [
    'cash',
    'mobile_money',
    'bank_transfer',
    'cheque',
    'card',
    'online',
  ];

  // Permissions
  canManageFinance = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private financeService: FinanceService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private paymentSms: PaymentSmsService,
    private paystackService: PaystackService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.pledgeId = this.route.snapshot.paramMap.get('id') || '';
    this.initializePaymentForm();

    if (this.pledgeId) {
      this.loadPledgeDetails();
      this.loadPaymentHistory();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

private checkPermissions(): void {
  const role = this.authService.getCurrentUserRole();

  const viewRoles = [
    'pastor', 'senior_pastor', 'associate_pastor', 'finance_officer',
  ];
  const manageRoles = ['finance_officer'];

  this.canManageFinance =
    this.permissionService.isAdmin ||
    this.permissionService.finance.manage ||
    this.permissionService.finance.record ||
    manageRoles.includes(role);

  const canView =
    this.permissionService.isAdmin ||
    this.permissionService.finance.view ||
    viewRoles.includes(role);

  if (!canView) {
    this.router.navigate(['/unauthorized']);
  }
}

  private initializePaymentForm(): void {
    this.paymentForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['GHS', Validators.required],
      payment_date: [
        new Date().toISOString().split('T')[0],
        Validators.required,
      ],
      payment_method: ['cash', Validators.required],
      transaction_reference: [''],
      notes: [''],
    });
  }

  private loadPledgeDetails(): void {
    this.loading = true;
    this.errorMessage = '';

    this.financeService
      .getPledgeById(this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pledge) => {
          this.pledge = pledge;

          // Set currency in payment form
          this.paymentForm.patchValue({
            currency: pledge.currency,
          });

          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load pledge details';
          this.loading = false;
          console.error('Error loading pledge:', error);
        },
      });
  }

  private loadPaymentHistory(): void {
    this.financeService
      .getPledgePayments(this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (payments) => {
          this.payments = payments;
        },
        error: (error) => {
          console.error('Error loading payments:', error);
        },
      });
  }

  openPaymentModal(): void {
    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to record payments';
      return;
    }

    if (this.pledge.is_fulfilled) {
      this.errorMessage = 'This pledge has already been fulfilled';
      return;
    }

    const remainingBalance = this.getBalance();
    this.paymentForm.patchValue({
      amount: remainingBalance,
      currency: this.pledge.currency,
    });

    // Set max validator
    this.paymentForm
      .get('amount')
      ?.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(remainingBalance),
      ]);
    this.paymentForm.get('amount')?.updateValueAndValidity();

    this.sendSms = this.canOfferSms && this.pledgerHasPhone;
    this.payMode = 'record';
    this.onlineEmail = '';
    this.onlineError = '';
    this.onlineLink = '';
    this.onlineInfo = '';
    this.linkCopied = false;
    this.linkSmsMessage = '';
    this.showPaymentModal = true;
  }

  /** SMS is offered for MEMBER pledges only, to people who may send SMS */
  get canOfferSms(): boolean {
    return !!this.pledge?.member && this.paymentSms.canSendAlerts;
  }
  get pledgerHasPhone(): boolean {
    return !!this.pledge?.member?.phone_primary?.trim();
  }

  // ── Collect online (Paystack pay link) ──────────────────────────────────────

  setPayMode(mode: 'record' | 'online'): void {
    if (this.recordingPayment || this.onlineBusy) return;
    this.payMode = mode;
    this.onlineError = '';
  }

  get canSmsLink(): boolean {
    return this.canOfferSms && this.pledgerHasPhone && !!this.onlineLink;
  }

  async createOnlineLink(): Promise<void> {
    if (this.onlineBusy) return;
    const amount = Math.round(parseFloat(this.paymentForm.get('amount')?.value) * 100) / 100;
    const balance = this.getBalance();

    if (!Number.isFinite(amount) || amount <= 0) {
      this.onlineError = 'Enter an amount greater than 0.';
      return;
    }
    if (amount > balance + 0.005) {
      this.onlineError = 'Amount cannot be more than the remaining balance.';
      return;
    }

    this.onlineBusy = true;
    this.onlineError = '';
    this.onlineLink = '';
    this.linkSmsMessage = '';
    try {
      const result = await this.paystackService.initializePledgePayment({
        pledge_id: this.pledgeId,
        amount,
        mode: 'link',
        payer_email: this.onlineEmail.trim() || undefined,
      });
      this.onlineLink = result.authorization_url;
      this.onlineInfo =
        result.charge_amount > result.pledge_amount
          ? `Payer will be charged ${this.formatCurrency(result.charge_amount, this.pledge.currency)} ` +
            `(includes ${this.formatCurrency(result.charge_amount - result.pledge_amount, this.pledge.currency)} fees); ` +
            `the pledge is credited ${this.formatCurrency(result.pledge_amount, this.pledge.currency)}.`
          : `The pledge will be credited ${this.formatCurrency(result.pledge_amount, this.pledge.currency)}.`;
    } catch (e: any) {
      this.onlineError = e?.message || 'Could not create the payment link.';
    } finally {
      this.onlineBusy = false;
    }
  }

  async copyOnlineLink(): Promise<void> {
    if (!this.onlineLink) return;
    const ok = await copyToClipboard(this.onlineLink);
    if (ok) {
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2500);
    } else {
      this.onlineError = 'Could not copy automatically. Select the link and copy it.';
    }
  }

  async sendOnlineLinkBySms(): Promise<void> {
    const member = this.pledge?.member;
    if (!member || !this.onlineLink || this.onlineBusy) return;
    this.onlineBusy = true;
    this.linkSmsMessage = 'Sending SMS…';
    const amount = Math.round(parseFloat(this.paymentForm.get('amount')?.value) * 100) / 100;
    const result = await this.paymentSms.sendPledgePayLink({
      memberId: member.id,
      firstName: member.first_name,
      amount,
      currency: this.pledge.currency,
      link: this.onlineLink,
    });
    this.linkSmsMessage = result.sent ? 'SMS sent to the member.' : `SMS not sent: ${result.error}`;
    this.onlineBusy = false;
  }

  closePaymentModal(): void {
    this.showPaymentModal = false;
    this.paymentForm.reset({
      amount: '',
      currency: this.pledge?.currency || 'GHS',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      transaction_reference: '',
      notes: '',
    });
  }

  recordPayment(): void {
    if (this.payMode !== 'record') return; // pressing Enter in online mode must not record a payment
    if (this.paymentForm.invalid) {
      Object.keys(this.paymentForm.controls).forEach((key) => {
        this.paymentForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.recordingPayment = true;
    this.errorMessage = '';

    const paymentData = this.paymentForm.value;

    // Capture what the SMS needs BEFORE the modal resets / pledge reloads
    const member = this.pledge?.member;
    const wantSms = this.sendSms && !!member && this.pledgerHasPhone && this.paymentSms.canSendAlerts;
    const paidAmount = parseFloat(paymentData.amount);
    const balanceAfter = Math.max(0, this.getBalance() - paidAmount);

    this.financeService
      .recordPledgePayment(this.pledgeId, paymentData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          this.successMessage = 'Payment recorded successfully!';
          this.loadPledgeDetails();
          this.loadPaymentHistory();
          this.closePaymentModal();

          // The payment is already saved. The SMS can never undo it.
          if (wantSms && member) {
            this.successMessage += ' Sending SMS…';
            const result = await this.paymentSms.sendPledgePaymentReceipt({
              memberId: member.id,
              firstName: member.first_name,
              amount: paidAmount,
              currency: paymentData.currency,
              balanceAfter,
              date: paymentData.payment_date,
            });
            this.successMessage = result.sent
              ? 'Payment recorded successfully! SMS confirmation sent.'
              : `Payment recorded successfully! (SMS not sent: ${result.error})`;
          }
          this.recordingPayment = false;

          setTimeout(() => {
            this.successMessage = '';
          }, wantSms ? 6000 : 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to record payment';
          this.recordingPayment = false;
          console.error('Error recording payment:', error);
        },
      });
  }

  deletePayment(paymentId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageFinance) {
      this.errorMessage = 'You do not have permission to delete payments';
      return;
    }

    if (
      !confirm(
        'Are you sure you want to delete this payment? This will adjust the pledge balance.',
      )
    ) {
      return;
    }

    this.financeService
      .deletePledgePayment(paymentId, this.pledgeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Payment deleted successfully!';
          this.loadPledgeDetails();
          this.loadPaymentHistory();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete payment';
          console.error('Error deleting payment:', error);
        },
      });
  }

  goBack(): void {
    this.router.navigate(['main/finance/pledges']);
  }

  // Helper methods
  getPledgerName(): string {
    if (this.pledge.member) {
      return `${this.pledge.member.first_name} ${this.pledge.member.last_name}`;
    }
    if (this.pledge.visitor_first_name && this.pledge.visitor_last_name) {
      return `${this.pledge.visitor_first_name} ${this.pledge.visitor_last_name}`;
    }
    return 'Unknown';
  }

  getPledgerType(): string {
    return this.pledge.member ? 'Member' : 'Visitor/Guest';
  }

  getPledgerInitials(): string {
    if (this.pledge.member) {
      return `${this.pledge.member.first_name[0]}${this.pledge.member.last_name[0]}`.toUpperCase();
    }
    if (this.pledge.visitor_first_name && this.pledge.visitor_last_name) {
      return `${this.pledge.visitor_first_name[0]}${this.pledge.visitor_last_name[0]}`.toUpperCase();
    }
    return '?';
  }

  getBalance(): number {
    return this.pledge.pledge_amount - this.pledge.amount_paid;
  }

  getProgressPercentage(): number {
    if (this.pledge.pledge_amount === 0) return 0;
    const percentage =
      (this.pledge.amount_paid / this.pledge.pledge_amount) * 100;
    return Math.min(Math.round(percentage), 100);
  }

  getProgressClass(): string {
    const percentage = this.getProgressPercentage();
    if (percentage >= 100) return 'progress-complete';
    if (percentage >= 50) return 'progress-medium';
    return 'progress-low';
  }

  formatCurrency(amount: number, currency: string = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
    }).format(amount || 0);
  }

  formatPaymentMethod(method: string): string {
    return method
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}




