import { Component, OnInit, NgZone } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './core/services/auth';
import { SupabaseService } from './core/services/supabase';
import { SubscriptionService } from './core/services/subscription.service';
import { trigger, style, transition, animate } from '@angular/animations';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, take } from 'rxjs/operators';
import { SettingsService } from './features/settings/services';

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
    private updates: SwUpdate,
    private ngZone: NgZone,
    private settingsService: SettingsService
  ) {
    this.authService.setSubscriptionService(this.subscriptionService);
    this.clearStuckLocks();
    this.initServiceWorkerUpdates();
  }

  private initServiceWorkerUpdates(): void {
    if (!this.updates.isEnabled) return;

    // Only listen for VERSION_READY — this is the only state where
    // a new version is fully installed and safe to activate.
    this.updates.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
      )
      .subscribe(() => {
        // Run inside NgZone so Angular's change detection picks up the flag.
        this.ngZone.run(() => {
          this.updateAvailable = true;
        });
      });

    // Proactively check for updates on app load, then every 6 hours.
    this.updates
      .checkForUpdate()
      .catch((err) => console.warn('SW update check failed:', err));

    setInterval(
      () => {
        this.updates
          .checkForUpdate()
          .catch((err) => console.warn('SW update check failed:', err));
      },
      6 * 60 * 60 * 1000,
    );
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

    this.authService.currentProfile$
  .pipe(filter(p => !!p), take(1))
  .subscribe(() => {
    this.settingsService.refreshChurchProfile(); // seeds the BehaviorSubject early
  });

    this.isOffline = !navigator.onLine;
    window.addEventListener('online', () =>
      this.ngZone.run(() => (this.isOffline = false)),
    );
    window.addEventListener('offline', () =>
      this.ngZone.run(() => (this.isOffline = true)),
    );
  }

  private clearStuckLocks(): void {
    try {
      const hasCleared = sessionStorage.getItem('locks-cleared');
      if (!hasCleared) {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-'))
          .forEach((key) => localStorage.removeItem(key));
        sessionStorage.setItem('locks-cleared', 'true');
      }
    } catch (error) {
      console.error('Error clearing locks:', error);
    }
  }

  updateApp(): void {
    this.updates
      .activateUpdate()
      .then(() => {
        window.location.reload();
      })
      .catch(() => {
        // Fallback if activateUpdate fails
        window.location.reload();
      });
    this.updateAvailable = false;
  }

  dismissUpdate(): void {
    this.updateAvailable = false;
  }
}


