// subscription.service.ts
import { Injectable, Injector } from '@angular/core';
import { Observable, from, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SupabaseService } from './supabase';
// ❌ REMOVE THIS IMPORT
// import { AuthService } from './auth';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_members: number | null;
  max_branches: number | null;
  max_users: number | null;
  max_forms: number | null;
  max_events: number | null;
  max_ministries: number | null;
  can_export: boolean;
  can_send_communications: boolean;
  can_use_reports: boolean;
  can_custom_branding: boolean;
}

export interface ChurchUsage {
  members: number;
  branches: number;
  users: number;
  forms: number;
  events: number;
  ministries: number;
}

export interface QuotaCheck {
  allowed: boolean;
  current: number;
  limit: number | null;
  tier: string;
  is_unlimited: boolean;
  is_expired: boolean;
  upgrade_required: boolean;
}

export interface SubscriptionStatus {
  plan: SubscriptionPlan;
  usage: ChurchUsage;
  tier: string;
  is_expired: boolean;
  expires_at: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private statusSubject = new BehaviorSubject<SubscriptionStatus | null>(null);
  public status$ = this.statusSubject.asObservable();

  // ✅ Lazy-loaded AuthService to break circular dependency
  private _authService: any;

  constructor(
    private supabase: SupabaseService,
    private injector: Injector, // ✅ Inject Injector instead of AuthService
  ) {}

  // ✅ Lazy getter for AuthService
  private get authService(): any {
    if (!this._authService) {
      this._authService = this.injector.get('AuthService' as any);
    }
    return this._authService;
  }

  private getChurchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found');
    return id;
  }

  // Load and cache subscription status — call this after login
  async loadStatus(): Promise<void> {
    try {
      const churchId = this.getChurchId();

      const [planData, usageData, churchData] = await Promise.all([
        this.getCurrentPlan(churchId),
        this.getUsage(churchId),
        this.getChurchSubscriptionData(churchId),
      ]);

      this.statusSubject.next({
        plan: planData,
        usage: usageData,
        tier: churchData.tier,
        is_expired: churchData.is_expired,
        expires_at: churchData.expires_at,
      });
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    }
  }

  // Clear on logout
  clearStatus(): void {
    this.statusSubject.next(null);
  }

  get currentStatus(): SubscriptionStatus | null {
    return this.statusSubject.value;
  }

  get currentTier(): string {
    return this.statusSubject.value?.tier || 'free';
  }

  get isFreePlan(): boolean {
    return this.currentTier === 'free';
  }

  get isPaidPlan(): boolean {
    return this.currentTier !== 'free';
  }

  // Check quota via DB (real-time, accurate)
  checkQuota(
    resource: 'members' | 'branches' | 'users' | 'forms' | 'events' | 'ministries',
  ): Observable<QuotaCheck> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client.rpc('check_quota', {
        p_church_id: churchId,
        p_resource: resource,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as QuotaCheck;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // Check quota from cache (fast, for UI display)
  canAdd(resource: keyof ChurchUsage): boolean {
    const status = this.statusSubject.value;
    if (!status) return true;

    const limits: Record<string, number | null> = {
      members: status.plan.max_members,
      branches: status.plan.max_branches,
      users: status.plan.max_users,
      forms: status.plan.max_forms,
      events: status.plan.max_events,
      ministries: status.plan.max_ministries,
    };

    const limit = limits[resource];
    if (limit === null) return true;
    return status.usage[resource] < limit;
  }

  // Check feature access
  canUseFeature(
    feature: 'export' | 'communications' | 'reports' | 'custom_branding',
  ): boolean {
    const status = this.statusSubject.value;
    if (!status) return false;
    if (status.is_expired) return false;

    switch (feature) {
      case 'export': return status.plan.can_export;
      case 'communications': return status.plan.can_send_communications;
      case 'reports': return status.plan.can_use_reports;
      case 'custom_branding': return status.plan.can_custom_branding;
      default: return false;
    }
  }

  // Get usage percentage for progress bars
  getUsagePercent(resource: keyof ChurchUsage): number {
    const status = this.statusSubject.value;
    if (!status) return 0;

    const limits: Record<string, number | null> = {
      members: status.plan.max_members,
      branches: status.plan.max_branches,
      users: status.plan.max_users,
      forms: status.plan.max_forms,
      events: status.plan.max_events,
      ministries: status.plan.max_ministries,
    };

    const limit = limits[resource];
    if (limit === null) return 0;
    return Math.min(100, Math.round((status.usage[resource] / limit) * 100));
  }

  // Get limit label for display
  getLimitLabel(resource: keyof ChurchUsage): string {
    const status = this.statusSubject.value;
    if (!status) return '';

    const limits: Record<string, number | null> = {
      members: status.plan.max_members,
      branches: status.plan.max_branches,
      users: status.plan.max_users,
      forms: status.plan.max_forms,
      events: status.plan.max_events,
      ministries: status.plan.max_ministries,
    };

    const limit = limits[resource];
    const current = status.usage[resource];
    if (limit === null) return `${current} (Unlimited)`;
    return `${current} / ${limit}`;
  }

  // Get all plans for upgrade modal
  getPlans(): Observable<SubscriptionPlan[]> {
    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as SubscriptionPlan[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // Called by super admin to upgrade a church
  upgradePlan(
    churchId: string,
    planId: string,
    durationMonths: number,
    paymentReference: string,
    billingEmail?: string,
  ): Observable<void> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    return from(
      this.supabase.client
        .from('churches')
        .update({
          subscription_plan: planId,
          subscription_tier: planId === 'pro' ? 'premium' : planId,
          subscription_expires_at: expiresAt.toISOString(),
          subscription_started_at: new Date().toISOString(),
          subscription_renewed_at: new Date().toISOString(),
          payment_reference: paymentReference,
          billing_email: billingEmail || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
        // Refresh cached status if upgrading own church
        const myChurchId = this.authService.getChurchId();
        if (churchId === myChurchId) {
          this.loadStatus();
        }
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  private async getCurrentPlan(churchId: string): Promise<SubscriptionPlan> {
    const { data: church } = await this.supabase.client
      .from('churches')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', churchId)
      .single();

    const isExpired =
      church?.subscription_expires_at &&
      new Date(church.subscription_expires_at) < new Date();

    const effectiveTier = isExpired
      ? 'free'
      : church?.subscription_plan || 'free';

    const { data: plan } = await this.supabase.client
      .from('subscription_plans')
      .select('*')
      .eq('id', effectiveTier)
      .single();

    return plan as SubscriptionPlan;
  }

  private async getUsage(churchId: string): Promise<ChurchUsage> {
    const { data } = await this.supabase.client.rpc('get_church_usage', {
      p_church_id: churchId,
    });
    return data as ChurchUsage;
  }

  private async getChurchSubscriptionData(churchId: string): Promise<{
    tier: string;
    is_expired: boolean;
    expires_at: string | null;
  }> {
    const { data } = await this.supabase.client
      .from('churches')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', churchId)
      .single();

    const isExpired =
      data?.subscription_expires_at &&
      new Date(data.subscription_expires_at) < new Date();

    return {
      tier: isExpired ? 'free' : data?.subscription_plan || 'free',
      is_expired: !!isExpired,
      expires_at: data?.subscription_expires_at || null,
    };
  }
}
