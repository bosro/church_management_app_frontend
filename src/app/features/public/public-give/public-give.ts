// src/app/features/public/public-give/public-give.ts
// Public (no login) giving page opened from a QR code.
//   /public/give/:churchId               → general QR  (payer picks the category)
//   /public/give/:churchId/:categoryId   → category QR (category shown at the top)
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase';
import { environment } from '../../../environments/environment';

interface PublicCategory {
  id: string;
  name: string;
  description?: string | null;
}

interface PublicGivingPage {
  found: boolean;
  church_name?: string;
  church_logo?: string | null;
  primary_color?: string | null;
  categories?: PublicCategory[];
  category_requested?: boolean;
  category_found?: boolean | null;
  category?: PublicCategory | null;
  pass_fees_to_payer?: boolean;
  paystack_fee_percent?: number;
  platform_fee_percent?: number;
}

type PageState = 'loading' | 'notfound' | 'unavailable' | 'form';

@Component({
  selector: 'app-public-give',
  standalone: false,
  templateUrl: './public-give.html',
  styleUrl: './public-give.scss',
})
export class PublicGive implements OnInit {
  readonly minAmount = 1;
  readonly maxAmount = 50000;
  readonly quickAmounts = [10, 20, 50, 100, 200, 500];

  churchId = '';
  fixedCategoryId = '';

  pageState: PageState = 'loading';
  page: PublicGivingPage | null = null;

  form!: FormGroup;
  submitting = false;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private supabase: SupabaseService,
  ) {}

  ngOnInit(): void {
    this.churchId = this.route.snapshot.paramMap.get('churchId') || '';
    this.fixedCategoryId = this.route.snapshot.paramMap.get('categoryId') || '';

    this.form = this.fb.group({
      category_id: [this.fixedCategoryId, Validators.required],
      payer_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      payer_phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9][0-9\s\-]{7,17}$/)]],
      payer_email: ['', [Validators.email, Validators.maxLength(150)]],
      amount: [null, [Validators.required, Validators.min(this.minAmount), Validators.max(this.maxAmount)]],
    });

    this.load();
  }

  /** true when the page was opened from a category QR */
  get isCategoryMode(): boolean {
    return !!this.fixedCategoryId;
  }

  get selectedCategory(): PublicCategory | null {
    if (this.isCategoryMode) return this.page?.category ?? null;
    const id = this.form.get('category_id')?.value;
    return this.page?.categories?.find((c) => c.id === id) ?? null;
  }

  get brandColor(): string {
    const c = this.page?.primary_color || '';
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#5b21b6';
  }

  // ── Fee breakdown — mirrors paystack-initialize-giving ────────
  get amountValue(): number {
    const n = Number(this.form?.get('amount')?.value);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  get chargeAmount(): number {
    const amt = this.amountValue;
    if (!amt || !this.page?.pass_fees_to_payer) return amt;
    const rate =
      ((this.page.paystack_fee_percent ?? 1.95) + (this.page.platform_fee_percent ?? 0.2)) / 100;
    return Math.ceil((amt / (1 - rate)) * 100) / 100;
  }

  get feeAmount(): number {
    return Math.round((this.chargeAmount - this.amountValue) * 100) / 100;
  }

  private async load(): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(this.churchId)) {
      this.pageState = 'notfound';
      return;
    }
    try {
      const { data, error } = await this.supabase.client.rpc('get_public_giving_page', {
        p_church_id: this.churchId,
        p_category_id: this.fixedCategoryId || null,
      });
      if (error) throw error;

      const page = data as PublicGivingPage;
      if (!page?.found) {
        this.pageState = 'notfound';
        return;
      }
      this.page = page;

      if (page.category_requested && !page.category_found) {
        this.pageState = 'unavailable';
        return;
      }
      if (!page.category_requested && !(page.categories?.length)) {
        this.pageState = 'unavailable';
        return;
      }
      this.pageState = 'form';
    } catch (e) {
      console.error('get_public_giving_page failed', e);
      this.pageState = 'notfound';
    }
  }

  pickAmount(n: number): void {
    this.form.patchValue({ amount: n });
    this.form.get('amount')?.markAsTouched();
  }

  fieldError(name: string): string {
    const c = this.form.get(name);
    if (!c || !c.touched || !c.errors) return '';
    if (c.hasError('required')) return name === 'category_id' ? 'Please choose what you are giving to' : 'This field is required';
    if (c.hasError('minlength')) return 'Please enter your full name';
    if (c.hasError('pattern')) return 'Enter a valid phone number';
    if (c.hasError('email')) return 'Enter a valid email or leave it blank';
    if (c.hasError('min')) return `Minimum amount is GHS ${this.minAmount}`;
    if (c.hasError('max')) return `Maximum online amount is GHS ${this.maxAmount.toLocaleString()}`;
    return 'Invalid value';
  }

  async submit(): Promise<void> {
    this.errorMessage = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill in the highlighted fields.';
      return;
    }

    const v = this.form.value;
    const categoryId = this.isCategoryMode ? this.fixedCategoryId : v.category_id;

    this.submitting = true;
    try {
      const res = await fetch(`${environment.supabaseUrl}/functions/v1/paystack-initialize-giving`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabaseAnonKey,
          Authorization: `Bearer ${environment.supabaseAnonKey}`,
        },
        body: JSON.stringify({
          church_id: this.churchId,
          category_id: categoryId,
          source: this.isCategoryMode ? 'category' : 'general',
          amount: this.amountValue,
          payer_name: String(v.payer_name).trim(),
          payer_phone: String(v.payer_phone).trim(),
          payer_email: String(v.payer_email || '').trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorization_url) {
        this.errorMessage = data.error || 'Could not start the payment. Please try again.';
        this.submitting = false;
        return;
      }
      window.location.href = data.authorization_url;   // → Paystack checkout
    } catch (e) {
      console.error(e);
      this.errorMessage = 'Network problem. Please check your connection and try again.';
      this.submitting = false;
    }
  }

  money(n: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(n || 0);
  }
}
