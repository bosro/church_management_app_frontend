// subscription.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, BehaviorSubject, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

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

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private getChurchId(): string | null {
    return this.authService.getChurchId() || null;
  }

  // ─── Status Management ───────────────────────────────────────────

  async loadStatus(): Promise<void> {
    try {
      const churchId = this.getChurchId();

      // Super admins have no church_id — subscription status not applicable
      if (!churchId) return;

      const [plan, usage, churchData] = await Promise.all([
        this.getCurrentPlan(churchId),
        this.getUsage(churchId),
        this.getChurchSubscriptionData(churchId),
      ]);

      this.statusSubject.next({
        plan,
        usage,
        tier: churchData.tier,
        is_expired: churchData.is_expired,
        expires_at: churchData.expires_at,
      });
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    }
  }

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

  // ─── Quota Checks ────────────────────────────────────────────────

  checkQuota(
    resource:
      | 'members'
      | 'branches'
      | 'users'
      | 'forms'
      | 'events'
      | 'ministries',
  ): Observable<QuotaCheck> {
    const churchId = this.getChurchId();

    // Super admins bypass all quota checks
    if (!churchId) {
      return from([
        {
          allowed: true,
          current: 0,
          limit: null,
          tier: 'super_admin',
          is_unlimited: true,
          is_expired: false,
          upgrade_required: false,
        } as QuotaCheck,
      ]);
    }

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

  canAdd(resource: keyof ChurchUsage): boolean {
    const status = this.statusSubject.value;
    if (!status) return true;
    const limit = this.getLimit(resource);
    if (limit === null) return true;
    return status.usage[resource] < limit;
  }

  // ─── Feature Access ──────────────────────────────────────────────

  canUseFeature(
    feature: 'export' | 'communications' | 'reports' | 'custom_branding',
  ): boolean {
    const status = this.statusSubject.value;
    if (!status || status.is_expired) return false;

    const featureMap: Record<string, boolean> = {
      export: status.plan.can_export,
      communications: status.plan.can_send_communications,
      reports: status.plan.can_use_reports,
      custom_branding: status.plan.can_custom_branding,
    };

    return featureMap[feature] ?? false;
  }

  // ─── Usage Display Helpers ───────────────────────────────────────

  getUsagePercent(resource: keyof ChurchUsage): number {
    const status = this.statusSubject.value;
    if (!status) return 0;
    const limit = this.getLimit(resource);
    if (limit === null) return 0;
    return Math.min(100, Math.round((status.usage[resource] / limit) * 100));
  }

  getLimitLabel(resource: keyof ChurchUsage): string {
    const status = this.statusSubject.value;
    if (!status) return '';
    const limit = this.getLimit(resource);
    const current = status.usage[resource];
    return limit === null ? `${current} (Unlimited)` : `${current} / ${limit}`;
  }

  private getLimit(resource: keyof ChurchUsage): number | null {
    const plan = this.statusSubject.value?.plan;
    if (!plan) return null;

    const limitMap: Record<string, number | null> = {
      members: plan.max_members,
      branches: plan.max_branches,
      users: plan.max_users,
      forms: plan.max_forms,
      events: plan.max_events,
      ministries: plan.max_ministries,
    };

    return limitMap[resource] ?? null;
  }

  // ─── Plans ───────────────────────────────────────────────────────

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

  // ─── Upgrade (Super Admin) ───────────────────────────────────────

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
        const myChurchId = this.getChurchId();
        if (myChurchId && churchId === myChurchId) {
          this.loadStatus();
        }
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ─── Private Helpers ─────────────────────────────────────────────

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
    return (data || {
      members: 0,
      branches: 0,
      users: 0,
      forms: 0,
      events: 0,
      ministries: 0,
    }) as ChurchUsage;
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

  get isFreeTier(): boolean {
    const tier = this.currentTier;
    return tier === 'free' || tier === 'starter';
  }
}


