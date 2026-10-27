// src/app/features/public/public-give-callback/public-give-callback.ts
// Paystack sends the payer back here: /public/give/thank-you?reference=QR-…
// We ask paystack-verify-giving for the real status (it also completes the payment if the
// webhook was slow) and poll a few times before showing "still processing".
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

interface VerifyResult {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'abandoned';
  amount: number;
  charge_amount: number;
  currency: string;
  category_name: string | null;
  church_name: string | null;
  payer_first_name: string | null;
  church_id: string;
  category_id: string;
  giving_source: 'qr_category' | 'qr_general' | null;
}

type ViewState = 'checking' | 'success' | 'processing' | 'failed' | 'error';

@Component({
  selector: 'app-public-give-callback',
  standalone: false,
  templateUrl: './public-give-callback.html',
  styleUrl: './public-give-callback.scss',
})
export class PublicGiveCallback implements OnInit, OnDestroy {
  private readonly maxAttempts = 6;
  private readonly delayMs = 2500;

  reference = '';
  state: ViewState = 'checking';
  result: VerifyResult | null = null;
  errorMessage = '';

  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.reference = q.get('reference') || q.get('trxref') || '';
    if (!this.reference) {
      this.state = 'error';
      this.errorMessage = 'No payment reference was found in this link.';
      return;
    }
    this.check();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** "Check again" button after the automatic checks give up */
  retry(): void {
    this.attempts = 0;
    this.state = 'checking';
    this.check();
  }

  /** Back to the page the payer came from (same QR) so they can give again */
  get giveAgainLink(): string[] {
    if (!this.result) return ['/'];
    const base = ['/public/give', this.result.church_id];
    return this.result.giving_source === 'qr_category' ? [...base, this.result.category_id] : base;
  }

  private async check(): Promise<void> {
    if (this.destroyed) return;
    this.attempts++;
    try {
      const res = await fetch(`${environment.supabaseUrl}/functions/v1/paystack-verify-giving`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabaseAnonKey,
          Authorization: `Bearer ${environment.supabaseAnonKey}`,
        },
        body: JSON.stringify({ reference: this.reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (this.destroyed) return;

      if (!res.ok) {
        this.state = 'error';
        this.errorMessage = data.error || 'We could not check this payment.';
        return;
      }

      this.result = data as VerifyResult;
      if (this.result.status === 'completed') {
        this.state = 'success';
      } else if (this.result.status === 'failed') {
        this.state = 'failed';
      } else if (this.attempts < this.maxAttempts) {
        this.timer = setTimeout(() => this.check(), this.delayMs);
      } else {
        this.state = 'processing';
      }
    } catch (e) {
      if (this.destroyed) return;
      if (this.attempts < this.maxAttempts) {
        this.timer = setTimeout(() => this.check(), this.delayMs);
      } else {
        this.state = 'error';
        this.errorMessage = 'Network problem while checking your payment.';
      }
    }
  }

  money(n: number | undefined): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: this.result?.currency || 'GHS' }).format(n || 0);
  }
}
