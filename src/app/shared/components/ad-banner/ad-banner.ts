// src/app/shared/components/ad-banner/ad-banner.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-ad-banner',
  standalone: false,
  templateUrl: './ad-banner.html',
  styleUrl: './ad-banner.scss',
})
export class AdBanner implements OnInit, AfterViewInit, OnDestroy {
  @Input() slot: 'sidebar' | 'dashboard' | 'inline' = 'sidebar';

  showAd = false;
  adLoaded = false;
  dismissed = false;

  // Your Google AdSense publisher ID — replace with real one
  // Format: ca-pub-XXXXXXXXXXXXXXXXX
  readonly publisherId = 'ca-pub-XXXXXXXXXXXXXXXXX';

  // Ad slot IDs from your AdSense dashboard (one per placement)
  readonly adSlots: Record<string, string> = {
    sidebar: '1234567890', // replace with real slot IDs from AdSense
    dashboard: '0987654321',
    inline: '1122334455',
  };

  constructor(
    private subscriptionService: SubscriptionService,
    private authService: AuthService,
    private el: ElementRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.currentProfile?.role;

    // Only show ads to plain members — all staff roles are excluded
    const staffRoles = [
      'super_admin',
      'senior_pastor',
      'associate_pastor',
      'finance_officer',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'elder',
      'deacon',
      'worship_leader',
    ];

    if (!role || staffRoles.includes(role)) return;
    if (sessionStorage.getItem(`ad-dismissed-${this.slot}`)) return;

    this.showAd = this.subscriptionService.isFreeTier;
  }

  ngAfterViewInit(): void {
    if (!this.showAd) return;

    // Load AdSense script once (if not already loaded)
    if (!document.getElementById('adsense-script')) {
      const script = document.createElement('script');
      script.id = 'adsense-script';
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.publisherId}`;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    // Push ad after script loads
    setTimeout(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push(
          {},
        );
        this.adLoaded = true;
      } catch (e) {
        console.warn('AdSense not available (ad blocker or test mode):', e);
        this.adLoaded = true; // still show fallback
      }
    }, 500);
  }

  ngOnDestroy(): void {}

  navigateToUpgrade(): void {
    this.router.navigate(['/main/settings'], {
      queryParams: { tab: 'subscription' },
    });
  }

  dismiss(): void {
    this.dismissed = true;
    sessionStorage.setItem(`ad-dismissed-${this.slot}`, 'true');
  }

  get adSlotId(): string {
    return this.adSlots[this.slot] || this.adSlots['sidebar'];
  }

  get adFormat(): string {
    return this.slot === 'sidebar' ? 'auto' : 'horizontal';
  }
}
