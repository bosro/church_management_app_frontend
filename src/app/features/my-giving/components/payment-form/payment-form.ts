// src/app/features/my-giving/components/payment-form/payment-form.component.ts
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  OnDestroy,
  Output,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  GivingCategory,
  CreateTransactionData,
  PaymentMethod,
} from '../../../../models/giving.model';
import { SupabaseService } from '../../../../core/services/supabase';

@Component({
  selector: 'app-payment-form',
  standalone: false,
  templateUrl: './payment-form.html',
  styleUrl: './payment-form.scss',
})
export class PaymentForm implements OnInit, OnDestroy {
  @Input() categories: GivingCategory[] = [];
  @Input() loading = false;
  @Output() formSubmit = new EventEmitter<CreateTransactionData>();
  @Output() formCancel = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  paymentForm!: FormGroup;

  paymentMethods = [
    {
      value: 'paystack',
      label: 'Pay Online (Card / MoMo)',
      icon: 'ri-secure-payment-line',
      isOnline: true,
    },
    {
      value: 'mobile_money',
      label: 'Mobile Money (Manual)',
      icon: 'ri-smartphone-line',
      isOnline: false,
    },
    {
      value: 'cash',
      label: 'Cash',
      icon: 'ri-money-dollar-circle-line',
      isOnline: false,
    },
    {
      value: 'bank_transfer',
      label: 'Bank Transfer',
      icon: 'ri-bank-line',
      isOnline: false,
    },
    {
      value: 'card',
      label: 'Card (Manual)',
      icon: 'ri-bank-card-line',
      isOnline: false,
    },
    {
      value: 'cheque',
      label: 'Cheque',
      icon: 'ri-file-list-line',
      isOnline: false,
    },
  ];

  // ── Platform fee settings (loaded from Supabase) ─────────
  paystackFeePercent = 1.95; // default — overridden from platform_settings
  platformFeePercent = 0.2; // default — overridden from platform_settings
  passFeesToPayer = true; // default — overridden from platform_settings
  loadingFees = false;

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadFeeSettings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.paymentForm = this.fb.group({
      category_id: ['', Validators.required],
      amount: ['', [Validators.required, Validators.min(1)]],
      payment_method: ['', Validators.required],
      mobile_number: [''],
      bank_name: [''],
      account_number: [''],
      card_number: [''],
      notes: ['', Validators.maxLength(500)],
    });

    this.paymentForm
      .get('payment_method')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((method) => this.updateConditionalValidators(method));
  }

  // ── Load fee settings from platform_settings table ────────
  private loadFeeSettings(): void {
    this.loadingFees = true;
    this.supabase.client
      .from('platform_settings')
      .select('key, value')
      .in('key', [
        'paystack_fee_percent',
        'platform_fee_percent',
        'pass_fees_to_payer',
      ])
      .then(({ data }) => {
        this.loadingFees = false;
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((s: any) => {
          map[s.key] = s.value;
        });
        if (map['paystack_fee_percent'])
          this.paystackFeePercent = parseFloat(map['paystack_fee_percent']);
        if (map['platform_fee_percent'])
          this.platformFeePercent = parseFloat(map['platform_fee_percent']);
        if (map['pass_fees_to_payer'])
          this.passFeesToPayer = map['pass_fees_to_payer'] !== 'false';
      });
  }

  // ── Fee calculation getters ────────────────────────────────
  // These mirror the exact formula used in the Edge Function
  get totalFeePercent(): number {
    return this.paystackFeePercent + this.platformFeePercent;
  }

  get chargeAmount(): number {
    const amount = parseFloat(this.paymentForm.get('amount')?.value || '0');
    if (!amount || !this.passFeesToPayer) return amount;
    const combinedRate = this.totalFeePercent / 100;
    return Math.ceil((amount / (1 - combinedRate)) * 100) / 100;
  }

  get feeAmount(): number {
    const amount = parseFloat(this.paymentForm.get('amount')?.value || '0');
    return Math.max(0, this.chargeAmount - amount);
  }

  // ── Payment method helpers ─────────────────────────────────
  get selectedMethod(): string {
    return this.paymentForm.get('payment_method')?.value || '';
  }

  isSelected(value: string): boolean {
    return this.selectedMethod === value;
  }

  selectMethod(value: string): void {
    this.paymentForm.patchValue({ payment_method: value });
    this.paymentForm.get('payment_method')!.markAsTouched();
    this.paymentForm.get('payment_method')!.markAsDirty();
  }

  private updateConditionalValidators(method: string): void {
    const fields = [
      'mobile_number',
      'bank_name',
      'account_number',
      'card_number',
    ];
    fields.forEach((f) => {
      this.paymentForm.get(f)?.clearValidators();
      this.paymentForm.get(f)?.updateValueAndValidity();
    });

    switch (method) {
      case 'mobile_money':
        this.paymentForm
          .get('mobile_number')
          ?.setValidators([Validators.required]);
        break;
      case 'bank_transfer':
        this.paymentForm.get('bank_name')?.setValidators([Validators.required]);
        this.paymentForm
          .get('account_number')
          ?.setValidators([Validators.required]);
        break;
      case 'card':
        this.paymentForm
          .get('card_number')
          ?.setValidators([Validators.required]);
        break;
    }

    fields.forEach((f) => this.paymentForm.get(f)?.updateValueAndValidity());
  }

  // ── Submit ────────────────────────────────────────────────
  onSubmit(): void {
    if (this.paymentForm.invalid) {
      this.markAllTouched(this.paymentForm);
      return;
    }

    const v = this.paymentForm.value;
    const paymentData: CreateTransactionData = {
      category_id: v.category_id,
      amount: parseFloat(v.amount),
      payment_method: v.payment_method as PaymentMethod,
      notes: v.notes || undefined,
      mobile_number: v.mobile_number || undefined,
      bank_name: v.bank_name || undefined,
      account_number: v.account_number || undefined,
      card_number: v.card_number || undefined,
    };

    this.formSubmit.emit(paymentData);
  }

  onCancel(): void {
    this.formCancel.emit();
  }

  getErrorMessage(fieldName: string): string {
    const control = this.paymentForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('min')) return 'Amount must be greater than 0';
    if (control.hasError('maxlength'))
      return `Maximum ${control.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  private markAllTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) this.markAllTouched(control);
    });
  }
}
