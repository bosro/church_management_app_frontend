// src/app/features/finance/components/payment-links/payment-links.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { GivingCategory } from '../../../../models/giving.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';
import { SupabaseService } from '../../../../core/services/supabase';

export interface PaymentLink {
  id: string;
  church_id: string;
  category_id: string;
  category_name?: string;
  name: string;
  description?: string;
  payment_url: string;
  paystack_slug: string;
  fixed_amount?: number;
  currency: string;
  is_active: boolean;
  expiry_date?: string;
  created_at: string;
}

@Component({
  selector: 'app-payment-links',
  standalone: false,
  templateUrl: './payment-links.html',
  styleUrl: './payment-links.scss',
})
export class PaymentLinks implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  paymentLinks: PaymentLink[] = [];
  categories: GivingCategory[] = [];
  loading = false;
  creating = false;
  errorMessage = '';
  successMessage = '';

  showCreateModal = false;
  createForm!: FormGroup;
  allowAnyAmount = true;

  copiedLinkId: string | null = null;

  canManage = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    private supabase: SupabaseService,
    private location: Location,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCategories();
    this.loadPaymentLinks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();
    const manageRoles = ['finance_officer'];
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.finance.manage ||
      manageRoles.includes(role);
  }

  private initForm(): void {
    this.createForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', Validators.maxLength(300)],
      category_id: ['', Validators.required],
      allow_any_amount: [true],
      amount: [''],
      expiry_date: [''],
    });

    this.createForm.get('allow_any_amount')?.valueChanges.subscribe((val) => {
      this.allowAnyAmount = val;
      const amountCtrl = this.createForm.get('amount');
      if (val) {
        amountCtrl?.clearValidators();
      } else {
        amountCtrl?.setValidators([Validators.required, Validators.min(1)]);
      }
      amountCtrl?.updateValueAndValidity();
    });
  }

  private loadCategories(): void {
    this.financeService
      .getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.categories = c) });
  }

  loadPaymentLinks(): void {
    this.loading = true;
    const churchId = this.authService.getChurchId();
    if (!churchId) return;

    this.supabase.client
      .from('payment_links')
      .select('*, category:giving_categories(name)')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        this.loading = false;
        if (error) {
          this.errorMessage = error.message;
          return;
        }
        this.paymentLinks = (data || []).map((l: any) => ({
          ...l,
          category_name: l.category?.name,
        }));
      });
  }

  openCreateModal(): void {
    this.createForm.reset({ allow_any_amount: true });
    this.allowAnyAmount = true;
    this.errorMessage = '';
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
    this.createForm.reset({ allow_any_amount: true });
  }

  async createLink(): Promise<void> {
    if (this.createForm.invalid) {
      Object.keys(this.createForm.controls).forEach((k) =>
        this.createForm.get(k)?.markAsTouched(),
      );
      return;
    }

    this.creating = true;
    this.errorMessage = '';

    const {
      data: { session },
    } = await this.supabase.client.auth.getSession();
    if (!session) {
      this.errorMessage = 'Not authenticated';
      this.creating = false;
      return;
    }

    const supabaseUrl: string =
      (this.supabase.client as any).supabaseUrl ??
      (this.supabase.client as any).rest?.url?.replace('/rest/v1', '') ??
      '';

    const churchId = this.authService.getChurchId();
    const formVal = this.createForm.value;

    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/paystack-create-payment-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: formVal.name,
            description: formVal.description || undefined,
            category_id: formVal.category_id,
            church_id: churchId,
            allow_any_amount: formVal.allow_any_amount,
            amount: formVal.allow_any_amount
              ? undefined
              : parseFloat(formVal.amount),
            expiry_date: formVal.expiry_date || undefined,
          }),
        },
      );

      const result = await res.json();
      this.creating = false;

      if (!res.ok) {
        this.errorMessage = result.error || 'Failed to create payment link';
        return;
      }

      this.successMessage = `Payment link created! Sharing URL: ${result.payment_url}`;
      this.closeCreateModal();
      this.loadPaymentLinks();
      setTimeout(() => (this.successMessage = ''), 6000);
    } catch (err: any) {
      this.creating = false;
      this.errorMessage = err.message || 'Unexpected error';
    }
  }

  copyLink(link: PaymentLink): void {
    navigator.clipboard.writeText(link.payment_url).then(() => {
      this.copiedLinkId = link.id;
      setTimeout(() => (this.copiedLinkId = null), 2500);
    });
  }

  shareLink(link: PaymentLink): void {
    if (navigator.share) {
      navigator.share({
        title: link.name,
        text: `Support us — ${link.name}`,
        url: link.payment_url,
      });
    } else {
      this.copyLink(link);
    }
  }

  async toggleActive(link: PaymentLink): Promise<void> {
    const { error } = await this.supabase.client
      .from('payment_links')
      .update({ is_active: !link.is_active })
      .eq('id', link.id);

    if (error) {
      this.errorMessage = error.message;
      return;
    }
    link.is_active = !link.is_active;
  }

  async deleteLink(link: PaymentLink): Promise<void> {
    if (!confirm(`Delete "${link.name}"? This cannot be undone.`)) return;
    const { error } = await this.supabase.client
      .from('payment_links')
      .delete()
      .eq('id', link.id);
    if (error) {
      this.errorMessage = error.message;
      return;
    }
    this.paymentLinks = this.paymentLinks.filter((l) => l.id !== link.id);
    this.successMessage = 'Payment link deleted.';
    setTimeout(() => (this.successMessage = ''), 3000);
  }

  isExpired(link: PaymentLink): boolean {
    if (!link.expiry_date) return false;
    return new Date(link.expiry_date) < new Date();
  }

  formatCurrency(amount: number, currency = 'GHS'): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency,
    }).format(amount || 0);
  }

  getErrorMsg(field: string): string {
    const c = this.createForm.get(field);
    if (!c?.errors || !c.touched) return '';
    if (c.hasError('required')) return 'This field is required';
    if (c.hasError('min')) return 'Amount must be at least GHS 1';
    if (c.hasError('maxlength'))
      return `Maximum ${c.getError('maxlength').requiredLength} characters`;
    return 'Invalid input';
  }

  goBack(): void {
    this.location.back();
  }
}
