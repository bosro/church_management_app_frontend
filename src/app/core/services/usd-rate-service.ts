// src/app/core/services/usd-rate-service.ts   (v2: supports a rate typed by the admin)
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class UsdRateService {
  rate = 12;                         // GHS per 1 USD (shown until the real one arrives)
  mode: 'auto' | 'manual' = 'auto';  // auto = live rate, manual = rate typed by the admin
  updatedAt: string | null = null;
  source: string | null = null;
  loaded = false;
  private inflight: Promise<void> | null = null;

  constructor(private supabase: SupabaseService) {}

  /** Reads the rate; in auto mode the server refreshes it when it is older than 6 hours (or when force = true). */
  ensureFresh(force = false): Promise<void> {
    if (this.inflight && !force) return this.inflight;
    this.inflight = (async () => {
      try {
        const { data, error } = await this.supabase.client.functions.invoke('refresh-usd-rate', { body: { force } });
        if (!error && data?.rate) {
          this.apply(data.rate, data.updated_at, data.source, data.mode);
          return;
        }
      } catch { /* fall through to the stored value */ }
      const { data } = await this.supabase.client
        .from('platform_settings').select('key, value')
        .in('key', ['usd_ghs_rate', 'usd_ghs_rate_updated_at', 'usd_ghs_rate_source', 'usd_ghs_rate_mode']);
      const m: Record<string, string> = {};
      (data || []).forEach((r: any) => (m[r.key] = r.value));
      if (m['usd_ghs_rate']) this.apply(m['usd_ghs_rate'], m['usd_ghs_rate_updated_at'], m['usd_ghs_rate_source'], m['usd_ghs_rate_mode']);
      this.loaded = true;
    })();
    return this.inflight;
  }

  private apply(rate: any, updatedAt: any, source: any, mode: any): void {
    this.rate = Number(rate);
    this.updatedAt = updatedAt || null;
    this.source = source || null;
    this.mode = mode === 'manual' ? 'manual' : 'auto';
    this.loaded = true;
  }

  /** Super admin: use my own rate (all dollar plans are repriced straight away). */
  async setManualRate(rate: number): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('admin_set_usd_rate', { p_mode: 'manual', p_rate: rate });
    if (error) throw new Error(error.message);
    if (data?.status !== 'ok') throw new Error(data?.message || 'Could not save the rate');
    this.apply(rate, new Date().toISOString(), 'manual', 'manual');
  }

  /** Super admin: go back to the live rate. */
  async useLiveRate(): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('admin_set_usd_rate', { p_mode: 'auto' });
    if (error) throw new Error(error.message);
    if (data?.status !== 'ok') throw new Error(data?.message || 'Could not switch to the live rate');
    this.mode = 'auto';
    this.inflight = null;
    await this.ensureFresh(true);
  }

  /** dollars → cedis at the current rate (2 decimals) */
  toGhs(usd: number | null | undefined): number {
    return Math.round((Number(usd) || 0) * this.rate * 100) / 100;
  }
}