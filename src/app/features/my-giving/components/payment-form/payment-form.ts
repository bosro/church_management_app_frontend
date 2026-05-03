// src/app/features/my-giving/components/payment-form/payment-form.component.ts
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  GivingCategory,
  CreateTransactionData,
  PaymentMethod,
} from '../../../../models/giving.model';

@Component({
  selector: 'app-payment-form',
  standalone: false,
  templateUrl: './payment-form.html',
  styleUrl: './payment-form.scss',
})
export class PaymentForm implements OnInit {
  @Input() categories: GivingCategory[] = [];
  @Input() loading = false;
  @Output() formSubmit = new EventEmitter<CreateTransactionData>();
  @Output() formCancel = new EventEmitter<void>();

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

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.paymentForm = this.fb.group({
      category_id: ['', Validators.required],
      amount: ['', [Validators.required, Validators.min(1)]],
      payment_method: ['', Validators.required], // starts empty — nothing pre-selected
      mobile_number: [''],
      bank_name: [''],
      account_number: [''],
      card_number: [''],
      notes: ['', Validators.maxLength(500)],
    });

    // Update conditional validators whenever payment method changes
    this.paymentForm.get('payment_method')!.valueChanges.subscribe((method) => {
      this.updateConditionalValidators(method);
    });
  }

  // ── Getters ──────────────────────────────────────────────────
  get selectedMethod(): string {
    return this.paymentForm.get('payment_method')?.value || '';
  }

  isSelected(value: string): boolean {
    return this.selectedMethod === value;
  }

  // ── Method card click ────────────────────────────────────────
  selectMethod(value: string): void {
    this.paymentForm.patchValue({ payment_method: value });
    // Mark as touched so validation shows and submit enables
    this.paymentForm.get('payment_method')!.markAsTouched();
    this.paymentForm.get('payment_method')!.markAsDirty();
  }

  // ── Conditional field validators ─────────────────────────────
  private updateConditionalValidators(method: string): void {
    const fields = [
      'mobile_number',
      'bank_name',
      'account_number',
      'card_number',
    ];
    // Clear all
    fields.forEach((f) => {
      this.paymentForm.get(f)?.clearValidators();
      this.paymentForm.get(f)?.updateValueAndValidity();
    });

    // Add for current method
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

  // ── Submit ────────────────────────────────────────────────────
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
