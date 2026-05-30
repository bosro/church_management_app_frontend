// src/app/core/services/pwa-install.service.ts

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  /** Emits true when the browser has signalled the app is installable */
  canInstall$ = new BehaviorSubject<boolean>(false);

  /** Emits true once the app has been installed */
  installed$ = new BehaviorSubject<boolean>(false);

  private deferredPrompt: any = null;

  constructor(private ngZone: NgZone) {
    // ─── CRITICAL: listen HERE in the constructor, not in ngOnInit ───────────
    // beforeinstallprompt fires very early — often before Angular finishes
    // bootstrapping. Putting this in a constructor means the listener is
    // registered as soon as the service is first injected (which happens
    // during AppModule bootstrap, before any component's ngOnInit runs).

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      // Prevent the browser's own mini-infobar from appearing
      e.preventDefault();

      // Save the event so we can trigger it later from our custom UI
      this.deferredPrompt = e;

      // Run inside NgZone so Angular's change detection picks up the flag
      this.ngZone.run(() => {
        this.canInstall$.next(true);
      });
    });

    // Once installed, hide the banner
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.ngZone.run(() => {
        this.canInstall$.next(false);
        this.installed$.next(true);
      });
    });
  }

  /**
   * Call this when the user clicks your Install button.
   * Shows the browser's native install dialog.
   * Returns true if the user accepted, false if they dismissed.
   */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;

    // Show the native install dialog
    this.deferredPrompt.prompt();

    // Wait for the user's decision
    const { outcome } = await this.deferredPrompt.userChoice;

    // The prompt can only be used once — clear it regardless of outcome
    this.deferredPrompt = null;
    this.canInstall$.next(false);

    return outcome === 'accepted';
  }

  /** Dismiss the banner without installing */
  dismissInstallBanner(): void {
    this.canInstall$.next(false);
    // Optionally remember dismissal so we don't show it again this session
    try {
      sessionStorage.setItem('pwa-install-dismissed', 'true');
    } catch (_) {}
  }

  /** Check if user already dismissed this session */
  get wasDismissedThisSession(): boolean {
    try {
      return sessionStorage.getItem('pwa-install-dismissed') === 'true';
    } catch (_) {
      return false;
    }
  }
}


