// src/app/core/plan-gate.ts
// One place that decides "may this church use this paid feature right now?" for
// buttons that are not tied to a route (e.g. Export). Usage:
//
//   @RequiresPlan('export')
//   exportReport(): void { ... }
//
// While platform_settings.enforce_plan_limits = 'false' (default) the decorator does NOTHING.
// When it is 'true' and the church's plan lacks the feature, the method does not run and a
// "Upgrade required" pop-up (rendered once in app.html) is shown instead.
import { Subject } from 'rxjs';

export type GatedFeature = 'export' | 'communications' | 'reports' | 'custom_branding';

export class PlanGate {
  /** set by SubscriptionService when the status is loaded */
  static enforcement = false;
  static checker: ((feature: GatedFeature) => boolean) | null = null;

  static readonly prompt$ = new Subject<{ feature: GatedFeature; message: string }>();

  private static messages: Record<GatedFeature, string> = {
    export: 'Exporting data (Excel, CSV, PDF) is available on the Starter plan and above.',
    communications: 'Sending SMS and email messages is available on the Starter plan and above.',
    reports: 'Advanced reports are available on the Growth plan and above.',
    custom_branding: 'Custom branding is available on the Premium plan.',
  };

  /** true = go ahead. false = blocked (pop-up shown). Never blocks when unsure. */
  static allow(feature: GatedFeature): boolean {
    if (!PlanGate.enforcement || !PlanGate.checker) return true;
    try {
      if (PlanGate.checker(feature)) return true;
    } catch {
      return true;
    }
    PlanGate.prompt$.next({ feature, message: PlanGate.messages[feature] });
    return false;
  }
}

/** Method decorator: skip the method (and show the upgrade pop-up) when the plan lacks `feature`. */
export function RequiresPlan(feature: GatedFeature) {
  return function (_target: any, _key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      if (!PlanGate.allow(feature)) return;
      return original.apply(this, args);
    };
    return descriptor;
  };
}
