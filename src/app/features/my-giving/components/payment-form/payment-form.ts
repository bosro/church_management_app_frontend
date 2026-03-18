// src/app/features/my-giving/components/payment-form/payment-form.component.ts
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GivingCategory, CreateTransactionData, PaymentMethod } from '../../../../models/giving.model';

@Component({
  selector: 'app-payment-form',
  standalone: false,
  templateUrl: './payment-form.html',
  styleUrl: './payment-form.scss'
})
export class PaymentForm implements OnInit {
  @Input() categories: GivingCategory[] = [];
  @Input() loading = false;
  @Output() formSubmit = new EventEmitter<CreateTransactionData>();
  @Output() formCancel = new EventEmitter<void>();

  paymentForm!: FormGroup;

  paymentMethods = [
    { value: 'mobile_money', label: 'Mobile Money', icon: 'ri-smartphone-line' },
    { value: 'cash', label: 'Cash', icon: 'ri-money-dollar-circle-line' },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: 'ri-bank-line' },
    { value: 'card', label: 'Debit/Credit Card', icon: 'ri-bank-card-line' },
    { value: 'check', label: 'Check', icon: 'ri-file-list-line' },
    { value: 'online', label: 'Online Payment', icon: 'ri-global-line' }
  ];

  selectedPaymentMethod: string = '';

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
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
      notes: ['', Validators.maxLength(500)]
    });

    // Watch payment method changes
    this.paymentForm.get('payment_method')?.valueChanges.subscribe(method => {
      this.selectedPaymentMethod = method;
      this.updatePaymentMethodValidators(method);
    });
  }

  private updatePaymentMethodValidators(method: string): void {
    // Clear all payment detail validators first
    this.paymentForm.get('mobile_number')?.clearValidators();
    this.paymentForm.get('bank_name')?.clearValidators();
    this.paymentForm.get('account_number')?.clearValidators();
    this.paymentForm.get('card_number')?.clearValidators();

    // Add validators based on payment method (optional - for better UX)
    switch (method) {
      case 'mobile_money':
        this.paymentForm.get('mobile_number')?.setValidators([Validators.required]);
        break;
      case 'bank_transfer':
        this.paymentForm.get('bank_name')?.setValidators([Validators.required]);
        this.paymentForm.get('account_number')?.setValidators([Validators.required]);
        break;
      case 'card':
        this.paymentForm.get('card_number')?.setValidators([Validators.required]);
        break;
    }

    // Update validity
    this.paymentForm.get('mobile_number')?.updateValueAndValidity();
    this.paymentForm.get('bank_name')?.updateValueAndValidity();
    this.paymentForm.get('account_number')?.updateValueAndValidity();
    this.paymentForm.get('card_number')?.updateValueAndValidity();
  }

  onSubmit(): void {
    if (this.paymentForm.invalid) {
      this.markFormGroupTouched(this.paymentForm);
      return;
    }

    const formValue = this.paymentForm.value;
    const paymentData: CreateTransactionData = {
      category_id: formValue.category_id,
      amount: parseFloat(formValue.amount),
      payment_method: formValue.payment_method as PaymentMethod,
      notes: formValue.notes,
      mobile_number: formValue.mobile_number,
      bank_name: formValue.bank_name,
      account_number: formValue.account_number,
      card_number: formValue.card_number,
    };

    this.formSubmit.emit(paymentData);
  }

  onCancel(): void {
    this.formCancel.emit();
  }

  getErrorMessage(fieldName: string): string {
    const control = this.paymentForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('min')) {
      return 'Amount must be greater than 0';
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    return 'Invalid input';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}



