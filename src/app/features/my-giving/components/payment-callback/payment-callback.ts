import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaystackService } from '../../services/paystack';

type State = 'verifying' | 'success' | 'failed';

@Component({
  selector: 'app-payment-callback',
  standalone: false,
  templateUrl: './payment-callback.html',
  styleUrl: './payment-callback.scss',
})
export class PaymentCallback implements OnInit, OnDestroy {
  state: State = 'verifying';
  message = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private paystackService: PaystackService,
  ) {}

  ngOnInit(): void {
    // Paystack appends ?trxref=xxx&reference=xxx to the callback URL
    const urlRef =
      this.route.snapshot.queryParamMap.get('reference') ||
      this.route.snapshot.queryParamMap.get('trxref');
    const storedRef = sessionStorage.getItem('paystack_pending_ref');
    const reference = urlRef || storedRef;

    sessionStorage.removeItem('paystack_pending_ref');

    if (!reference) {
      this.state = 'failed';
      this.message = 'No payment reference found. Please contact support.';
      return;
    }

    this.poll(reference, 0);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private poll(reference: string, attempt: number): void {
    // Poll every 3s, give up after 36s (12 attempts)
    // Paystack webhook usually fires within 5–15 seconds of payment
    if (attempt >= 12) {
      this.state = 'success';
      this.message =
        'Your payment is being processed. It will appear in your giving history shortly.';
      this.timer = setTimeout(() => this.router.navigate(['/main/my-giving']), 4000);
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        const status = await this.paystackService.getPaymentStatus(reference);

        if (status === 'completed') {
          this.state = 'success';
          this.message = 'Payment confirmed! Your giving has been recorded.';
          setTimeout(() => this.router.navigate(['/main/my-giving']), 3000);
        } else if (status === 'failed' || status === 'abandoned') {
          this.state = 'failed';
          this.message =
            'Payment could not be completed. No amount was charged. Please try again.';
        } else {
          // 'pending' or null — keep polling
          this.poll(reference, attempt + 1);
        }
      } catch {
        this.poll(reference, attempt + 1);
      }
    }, 3000);
  }

  goHome(): void  { this.router.navigate(['/main/my-giving']); }
  tryAgain(): void { this.router.navigate(['/main/my-giving/make-payment']); }
}
