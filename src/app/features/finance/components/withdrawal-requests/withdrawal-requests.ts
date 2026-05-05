
// src/app/features/finance/components/withdrawal-requests/withdrawal-requests.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupabaseService } from '../../../../core/services/supabase';
import { AuthService } from '../../../../core/services/auth';

export interface WithdrawalRequest {
  id: string;
  church_id: string;
  amount: number;
  currency: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  rejection_reason?: string;
  paystack_transfer_code?: string;
  transfer_initiated_at?: string;
  transfer_completed_at?: string;
  created_at: string;
}

@Component({
  selector: 'app-withdrawal-requests',
  standalone: false,
  templateUrl: './withdrawal-requests.html',
  styleUrl: './withdrawal-requests.scss',
})
export class WithdrawalRequests implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  requests: WithdrawalRequest[] = [];
  loading = false;
  submitting = false;
  errorMessage = '';
  successMessage = '';

  showRequestModal = false;
  requestForm!: FormGroup;

  // Ghana banks list (common ones)
  banks = [
    { name: 'GCB Bank',       code: '040' },
    { name: 'Ecobank Ghana',  code: '130' },
    { name: 'Fidelity Bank',  code: '070' },
    { name: 'Absa Ghana',     code: '030' },
    { name: 'Stanbic Bank',   code: '190' },
    { name: 'Zenith Bank',    code: '057' },
    { name: 'Access Bank',    code: '044' },
    { name: 'CalBank',        code: '023' },
    { name: 'UBA Ghana',      code: '033' },
    { name: 'Republic Bank',  code: '101' },
  ];

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private authService: AuthService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadRequests();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.requestForm = this.fb.group({
      amount:         ['', [Validators.required, Validators.min(10)]],
      bank_name:      ['', Validators.required],
      bank_code:      [''],
      account_number: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(16)]],
      account_name:   ['', [Validators.required, Validators.maxLength(100)]],
      reason:         ['', Validators.maxLength(300)],
    });

    // Auto-fill bank_code when bank_name changes
    this.requestForm.get('bank_name')?.valueChanges.subscribe((name) => {
      const bank = this.banks.find((b) => b.name === name);
      this.requestForm.patchValue({ bank_code: bank?.code || '' }, { emitEvent: false });
    });
  }

  loadRequests(): void {
    this.loading = true;
    const churchId = this.authService.getChurchId();

    this.supabase.client
      .from('withdrawal_requests')
      .select('*')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        this.loading = false;
        if (error) { this.errorMessage = error.message; return; }
        this.requests = data || [];
      });
  }

  openRequestModal(): void {
    this.requestForm.reset();
    this.errorMessage = '';
    this.showRequestModal = true;
  }

  closeRequestModal(): void {
    this.showRequestModal = false;
    this.requestForm.reset();
  }

  async submitRequest(): Promise<void> {
    if (this.requestForm.invalid) {
      Object.keys(this.requestForm.controls).forEach((k) => this.requestForm.get(k)?.markAsTouched());
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const churchId = this.authService.getChurchId();
    const userId   = this.authService.currentProfile?.id;
    const val      = this.requestForm.value;

    const { error } = await this.supabase.client
      .from('withdrawal_requests')
      .insert({
        church_id:      churchId,
        requested_by:   userId,
        amount:         parseFloat(val.amount),
        currency:       'GHS',
        bank_name:      val.bank_name,
        bank_code:      val.bank_code || null,
        account_number: val.account_number,
        account_name:   val.account_name,
        reason:         val.reason || null,
        status:         'pending',
      });

    this.submitting = false;

    if (error) { this.errorMessage = error.message; return; }

    this.successMessage = 'Withdrawal request submitted! The Churchman team will review it shortly.';
    this.closeRequestModal();
    this.loadRequests();
    setTimeout(() => (this.successMessage = ''), 6000);
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending:    'Under Review',
      approved:   'Approved',
      rejected:   'Rejected',
      processing: 'Processing',
      completed:  'Completed',
      failed:     'Failed',
    };
    return map[status] || status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending:    'status-pending',
      approved:   'status-approved',
      rejected:   'status-rejected',
      processing: 'status-processing',
      completed:  'status-completed',
      failed:     'status-failed',
    };
    return map[status] || '';
  }

  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(amount || 0);
  }

  getErrorMsg(field: string): string {
    const c = this.requestForm.get(field);
    if (!c?.errors || !c.touched) return '';
    if (c.hasError('required'))   return 'This field is required';
    if (c.hasError('min'))        return 'Minimum withdrawal is GHS 10';
    if (c.hasError('minlength'))  return `Minimum ${c.getError('minlength').requiredLength} characters`;
    if (c.hasError('maxlength'))  return `Maximum ${c.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  goBack(): void { this.location.back(); }
}
