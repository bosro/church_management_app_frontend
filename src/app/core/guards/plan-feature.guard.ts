// src/app/core/guards/plan-feature.guard.ts
// Usage in a routing module:
//   { path: 'create', component: X, canActivate: [PermissionGuard, PlanFeatureGuard],
//     data: { planFeature: 'communications', ... } }
// Does nothing while platform_settings.enforce_plan_limits = 'false'.
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { SubscriptionService } from '../services/subscription.service';

@Injectable({ providedIn: 'root' })
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private subscriptionService: SubscriptionService,
    private router: Router,
  ) {}

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    const feature = route.data['planFeature'];
    if (!feature) return true;
    try {
      if (await this.subscriptionService.checkFeatureAccess(feature)) return true;
    } catch {
      return true; // never lock people out because of a lookup failure
    }
    return this.router.createUrlTree(['/main/settings'], {
      queryParams: { tab: 'subscription', locked: feature },
    });
  }
}
