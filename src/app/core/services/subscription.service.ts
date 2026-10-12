// subscription.service.ts
import { PlanGate } from '../plan-gate';
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
  // added by 01_subscription_migration.sql (optional so old data still type-checks)
  sms_monthly_limit?: number | null;
  can_remove_ads?: boolean;
  support_level?: string | null;
  tagline?: string | null;
  sort_order?: number;
  plan_features?: string[];
}

export type SubscriptionState = 'free' | 'active' | 'expiring' | 'grace' | 'expired' | 'complimentary';

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
  in_grace?: boolean;
  expires_at?: string | null;
}

export interface SubscriptionStatus {
  plan: SubscriptionPlan;
  usage: ChurchUsage;
  tier: string;
  is_expired: boolean;
  expires_at: string | null;
  // ── countdown / lifecycle (new) ──
  started_at: string | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  is_complimentary: boolean;
  state: SubscriptionState;
  in_grace: boolean;
  grace_ends_at: string | null;
  grace_days: number;
  sms_used: number;
  sms_limit: number | null;
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

      const sms = await this.getSmsUsage(churchId);
      this.statusSubject.next({
        plan,
        usage,
        tier: churchData.tier,
        is_expired: churchData.is_expired,
        expires_at: churchData.expires_at,
        started_at: churchData.started_at,
        billing_cycle: churchData.billing_cycle,
        is_complimentary: churchData.is_complimentary,
        state: churchData.state,
        in_grace: churchData.in_grace,
        grace_ends_at: churchData.grace_ends_at,
        grace_days: churchData.grace_days,
        sms_used: sms.used,
        sms_limit: sms.limit,
      });

      // arm the global feature gate (does nothing unless enforce_plan_limits = 'true')
      PlanGate.enforcement = await this.isEnforcementOn();
      PlanGate.checker = (f) => this.canUseFeature(f);
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    }
  }

  clearStatus(): void {
    PlanGate.checker = null;
    PlanGate.enforcement = false;
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
    if (!status) return false;

    const featureMap: Record<string, boolean> = {
      export: status.plan.can_export,
      communications: status.plan.can_send_communications,
      reports: status.plan.can_use_reports,
      custom_branding: status.plan.can_custom_branding,
    };

    return featureMap[feature] ?? false;
  }

  // ─── Plan enforcement switch (platform_settings.enforce_plan_limits) ──
  // While this is 'false' (the default) feature gates only DISPLAY hints and never block anyone,
  // so rolling out the new tiers cannot break churches that use features today.

  private enforcementOn: boolean | null = null;

  async isEnforcementOn(): Promise<boolean> {
    if (this.enforcementOn !== null) return this.enforcementOn;
    const { data } = await this.supabase.client
      .from('platform_settings')
      .select('value')
      .eq('key', 'enforce_plan_limits')
      .maybeSingle();
    this.enforcementOn = data?.value === 'true';
    return this.enforcementOn;
  }

  /**
   * Returns true when the church may use `feature` right now.
   * Super admins and churches while enforcement is OFF are always allowed.
   */
  async checkFeatureAccess(
    feature: 'export' | 'communications' | 'reports' | 'custom_branding',
  ): Promise<boolean> {
    if (!this.getChurchId()) return true; // super admin
    if (!(await this.isEnforcementOn())) return true;
    if (!this.statusSubject.value) await this.loadStatus();
    return this.canUseFeature(feature);
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
    // The database decides the effective plan (honours grace period + complimentary churches)
    const effectiveTier = await this.getEffectivePlanId(churchId);

    const { data: plan } = await this.supabase.client
      .from('subscription_plans')
      .select('*')
      .eq('id', effectiveTier)
      .single();

    return plan as SubscriptionPlan;
  }

  private async getEffectivePlanId(churchId: string): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('effective_plan_id', {
      p_church_id: churchId,
    });
    if (!error && typeof data === 'string' && data) return data;

    // Fallback if the migration has not been applied yet: old behaviour
    const { data: church } = await this.supabase.client
      .from('churches')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', churchId)
      .single();
    const expired =
      church?.subscription_expires_at && new Date(church.subscription_expires_at) < new Date();
    return expired ? 'free' : church?.subscription_plan || 'free';
  }

  private async getSmsUsage(churchId: string): Promise<{ used: number; limit: number | null }> {
    try {
      const { data, error } = await this.supabase.client.rpc('get_sms_usage', {
        p_church_id: churchId,
      });
      if (error || !data) return { used: 0, limit: null };
      return { used: data.used ?? 0, limit: data.limit ?? null };
    } catch {
      return { used: 0, limit: null };
    }
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
    started_at: string | null;
    billing_cycle: 'monthly' | 'yearly' | null;
    is_complimentary: boolean;
    state: SubscriptionState;
    in_grace: boolean;
    grace_ends_at: string | null;
    grace_days: number;
  }> {
    // select('*') so this keeps working before AND after the migration adds new columns
    const { data } = await this.supabase.client
      .from('churches')
      .select('*')
      .eq('id', churchId)
      .single();

    const { data: gs } = await this.supabase.client
      .from('platform_settings')
      .select('value')
      .eq('key', 'subscription_grace_days')
      .maybeSingle();
    const graceDays = parseInt(gs?.value ?? '7', 10) || 7;

    const tier = await this.getEffectivePlanId(churchId);
    const expiresAt: string | null = data?.subscription_expires_at || null;
    const complimentary = !!data?.is_complimentary;
    const expiry = expiresAt ? new Date(expiresAt).getTime() : null;
    const now = Date.now();
    const pastExpiry = !complimentary && expiry !== null && expiry < now;
    const graceEnds = expiry !== null ? new Date(expiry + graceDays * 86400000) : null;

    let state: SubscriptionState;
    if (tier === 'free' && (data?.subscription_plan ?? 'free') === 'free' && !pastExpiry) state = 'free';
    else if (complimentary) state = 'complimentary';
    else if (pastExpiry && tier !== 'free') state = 'grace';
    else if (pastExpiry) state = 'expired';
    else if (expiry !== null && expiry - now <= 7 * 86400000) state = 'expiring';
    else state = tier === 'free' ? 'free' : 'active';

    return {
      tier,
      is_expired: state === 'expired',
      expires_at: expiresAt,
      started_at: data?.subscription_started_at || null,
      billing_cycle: (data?.billing_cycle as 'monthly' | 'yearly') || null,
      is_complimentary: complimentary,
      state,
      in_grace: state === 'grace',
      grace_ends_at: state === 'grace' && graceEnds ? graceEnds.toISOString() : null,
      grace_days: graceDays,
    };
  }

  // ─── Countdown helpers (used by Settings + sidebar) ───────────────

  /** Whole days left until expiry (negative once expired). null = no expiry / complimentary / free. */
  get daysLeft(): number | null {
    const st = this.statusSubject.value;
    if (!st || !st.expires_at || st.is_complimentary || st.tier === 'free') return null;
    return Math.ceil((new Date(st.expires_at).getTime() - Date.now()) / 86400000);
  }

  /** Whole days left in the grace period (only meaningful when state === 'grace'). */
  get graceDaysLeft(): number | null {
    const st = this.statusSubject.value;
    if (!st?.grace_ends_at) return null;
    return Math.max(0, Math.ceil((new Date(st.grace_ends_at).getTime() - Date.now()) / 86400000));
  }

  /** Message for the global alert banner, or null when nothing needs attention. */
  get alertMessage(): { level: 'warn' | 'danger'; text: string } | null {
    const st = this.statusSubject.value;
    if (!st) return null;
    if (st.state === 'expiring') {
      const d = this.daysLeft ?? 0;
      return { level: 'warn', text: d <= 1
        ? `Your ${st.plan.name} plan expires today or tomorrow.`
        : `Your ${st.plan.name} plan expires in ${d} days.` };
    }
    if (st.state === 'grace') {
      const g = this.graceDaysLeft ?? 0;
      return { level: 'danger', text: `Your ${st.plan.name} plan has expired. Renew within ${g} day${g === 1 ? '' : 's'} to avoid moving to Free.` };
    }
    return null;
  }

  get isFreeTier(): boolean {
    const plan = this.statusSubject.value?.plan;
    if (plan && typeof plan.can_remove_ads === 'boolean') return !plan.can_remove_ads;
    const tier = this.currentTier;
    return tier === 'free' || tier === 'starter';
  }
}




