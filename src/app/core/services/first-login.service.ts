// src/app/core/services/first-login.service.ts
// Shows the upgrade modal once after a user signs in for the first time
// if their church is on the free plan but their church_size suggests they need more.
// Uses localStorage so it only fires once per church per browser.

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth';
import { SubscriptionService } from './subscription.service';

// Church sizes that exceed the free plan's 50-member limit
const SIZES_NEEDING_UPGRADE = ['51-200', '201-500', '501-1000', '1000+'];

@Injectable({ providedIn: 'root' })
export class FirstLoginService {
  // Emits true when the upgrade modal should be shown
  private showUpgradeSubject = new BehaviorSubject<boolean>(false);
  showUpgrade$ = this.showUpgradeSubject.asObservable();

  // The trigger message passed to the upgrade modal
  upgradeTrigger = '';

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
  ) {}

  // Call this from the dashboard component on init
  checkFirstLoginUpgrade(): void {
    const profile = this.authService.currentProfile;
    if (!profile) return;

    // Only applies to church_admin role
    if (profile.role !== 'church_admin') return;

    const churchId = profile.church_id;
    if (!churchId) return;

    // Only show once per church per browser
    const storageKey = `upgrade_prompted_${churchId}`;
    if (localStorage.getItem(storageKey)) return;

    // Only show if currently on free plan
    const status = this.subscriptionService.currentStatus;
    if (!status || status.tier !== 'free') return;

    // Check church size from the subscription status or profile
    // We need to read it from the churches table — do it via SubscriptionService
    // which already has the church data loaded
    this.checkChurchSize(churchId, storageKey);
  }

  private async checkChurchSize(churchId: string, storageKey: string): Promise<void> {
    try {
      // Re-use the already-injected auth service's Supabase client
      // by reading from the profile's church via a lightweight query
      const profile = this.authService.currentProfile;
      if (!profile) return;

      // Get church size_category from the churches table
      // We do this inline since we don't want to add a heavy dependency
      const supabase = (this.authService as any).supabase?.client;
      if (!supabase) return;

      const { data: church } = await supabase
        .from('churches')
        .select('size_category, name')
        .eq('id', churchId)
        .single();

      if (!church?.size_category) return;

      if (!SIZES_NEEDING_UPGRADE.includes(church.size_category)) return;

      // Mark as shown so we don't show again
      localStorage.setItem(storageKey, '1');

      // Build the trigger message
      this.upgradeTrigger =
        `Your church "${church.name}" is set to ${church.size_category} members, ` +
        `but your free plan only supports up to 50 members. ` +
        `Upgrade now to accommodate your full congregation.`;

      // Emit after a short delay so the dashboard has time to render
      setTimeout(() => {
        this.showUpgradeSubject.next(true);
      }, 1500);

    } catch (e) {
      // Non-fatal — just don't show the modal
      console.warn('FirstLoginService: could not check church size', e);
    }
  }

  dismiss(): void {
    this.showUpgradeSubject.next(false);
  }
}
