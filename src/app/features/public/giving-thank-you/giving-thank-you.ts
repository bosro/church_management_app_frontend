
// src/app/features/public/giving-thank-you/giving-thank-you.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-giving-thank-you',
  standalone: false,
  templateUrl: './giving-thank-you.html',
  styleUrl: './giving-thank-you.scss',
})
export class GivingThankYouPage implements OnInit {
  // Paystack appends ?reference=xxx&trxref=xxx to the redirect URL
  reference: string | null = null;
  categoryName: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.reference =
      this.route.snapshot.queryParamMap.get('reference') ||
      this.route.snapshot.queryParamMap.get('trxref') ||
      null;

    // Paystack doesn't pass category back in query params, but if you ever
    // embed it in the redirect_url as ?category=Offering it'll show here
    this.categoryName = this.route.snapshot.queryParamMap.get('category') || null;
  }

  makeAnother(): void {
    // If they have a Churchman account, go to make-payment
    // Otherwise just reload the page (they came from a shared link)
    this.router.navigate(['/main/my-giving/make-payment']).catch(() => {
      window.location.href = '/';
    });
  }
}
