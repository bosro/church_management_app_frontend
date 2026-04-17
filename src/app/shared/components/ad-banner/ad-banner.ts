// src/app/shared/components/ad-banner/ad-banner.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-ad-banner',
  standalone: false,
  templateUrl: './ad-banner.html',
  styleUrl: './ad-banner.scss',
})
export class AdBanner implements OnInit, AfterViewInit {
  @Input() slot: 'sidebar' | 'dashboard' | 'inline' = 'sidebar';

  showAd = false;
  adLoaded = false;
  dismissed = false;

  // ── Your real AdSense credentials ─────────────────────────────
  readonly publisherId = 'ca-pub-9715986446209067';

  readonly adSlots: Record<string, string> = {
    sidebar: '6724400062', // Churchman Sidebar
    dashboard: '8823737763', // Churchman Dashboard
    inline: '9521953795', // Churchman Inline
  };

  get adSlotId(): string {
    return this.adSlots[this.slot] || this.adSlots['sidebar'];
  }

  get adFormat(): string {
    // Sidebar = square/auto, Dashboard = horizontal banner
    return this.slot === 'dashboard' ? 'horizontal' : 'auto';
  }

  constructor(
    private subscriptionService: SubscriptionService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const role = this.authService.currentProfile?.role;
    const tier = this.subscriptionService.currentTier;

    // Only show to plain members
    if (role !== 'member') return;

    // Never show on pro or growth plans — only free and starter
    if (tier === 'pro' || tier === 'growth') return;

    // Respect session dismiss
    if (sessionStorage.getItem(`ad-dismissed-${this.slot}`)) {
      this.dismissed = true;
      return;
    }

    this.showAd = this.subscriptionService.isFreeTier;
  }

  ngAfterViewInit(): void {
    if (!this.showAd) return;
    setTimeout(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push(
          {},
        );
        this.adLoaded = true;
      } catch (e) {
        this.adLoaded = true;
      }
    }, 800);
  }

  dismiss(): void {
    this.dismissed = true;
    this.showAd = false;
    sessionStorage.setItem(`ad-dismissed-${this.slot}`, 'true');
  }

  navigateToUpgrade(): void {
    this.router.navigate(['/main/settings'], {
      queryParams: { tab: 'subscription' },
    });
  }
}
