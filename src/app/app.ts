// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, NavigationStart } from '@angular/router';
import { AuthService } from './core/services/auth';
import { SupabaseService } from './core/services/supabase';
import { SubscriptionService } from './core/services/subscription.service';
import { trigger, style, transition, animate } from '@angular/animations';
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss',
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate(
          '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateY(8px)' }),
        ),
      ]),
    ]),
  ],
})
export class App implements OnInit {
  title = 'Churchman.';
  showLayout = true;
  authInitialized = false;

  updateAvailable = false;
  isOffline = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private supabase: SupabaseService,
    private subscriptionService: SubscriptionService,
  ) {
    // Wire SubscriptionService into AuthService to break the circular dependency
    this.authService.setSubscriptionService(this.subscriptionService);
    this.clearStuckLocks();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              this.updateAvailable = true;
            }
          });
        });
      });
    }
  }

  ngOnInit(): void {
    this.supabase.authInitialized$.subscribe((initialized) => {
      this.authInitialized = initialized;
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.showLayout = !event.url.includes('/auth');
      }
    });

    this.isOffline = !navigator.onLine;
    window.addEventListener('online', () => (this.isOffline = false));
    window.addEventListener('offline', () => (this.isOffline = true));
  }

  private clearStuckLocks(): void {
    try {
      const hasCleared = sessionStorage.getItem('locks-cleared');
      if (!hasCleared) {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        sessionStorage.setItem('locks-cleared', 'true');
      }
    } catch (error) {
      console.error('Error clearing locks:', error);
    }
  }

  updateApp(): void {
    navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });
    this.updateAvailable = false;
  }

  dismissUpdate(): void {
    this.updateAvailable = false;
  }
}
