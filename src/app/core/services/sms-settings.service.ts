// src/app/core/services/sms-settings.service.ts
// Manages SMS provider configuration for the super admin panel.
// Reads/writes platform_settings and per-church sms_sender_id.

import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';

export type SmsProvider = 'giantsms' | 'hubtel';

export interface SmsProviderSettings {
  provider: SmsProvider;
  defaultSenderId: string;
}

export interface SmsTestResult {
  success: boolean;
  message: string;
  provider: SmsProvider;
}

@Injectable({ providedIn: 'root' })
export class SmsSettingsService {
  constructor(private supabase: SupabaseService) {}

  // ── Load current settings ──────────────────────────────────────────────────

  getSettings(): Observable<SmsProviderSettings> {
    return from(
      this.supabase.client
        .from('platform_settings')
        .select('key, value')
        .in('key', ['sms_provider', 'sms_default_sender_id']),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        const map: Record<string, string> = {};
        (data || []).forEach((s: any) => (map[s.key] = s.value));
        return {
          provider: (map['sms_provider'] ?? 'giantsms') as SmsProvider,
          defaultSenderId: map['sms_default_sender_id'] ?? 'CHURCHMAN',
        };
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Save settings ──────────────────────────────────────────────────────────

  saveSettings(settings: SmsProviderSettings): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_settings')
        .upsert([
          { key: 'sms_provider', value: settings.provider },
          { key: 'sms_default_sender_id', value: settings.defaultSenderId },
        ], { onConflict: 'key' }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Toggle provider only ───────────────────────────────────────────────────

  setProvider(provider: SmsProvider): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_settings')
        .upsert({ key: 'sms_provider', value: provider }, { onConflict: 'key' }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Per-church sender ID ───────────────────────────────────────────────────

  getChurchSenderId(churchId: string): Observable<string | null> {
    return from(
      this.supabase.client
        .from('churches')
        .select('sms_sender_id')
        .eq('id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) return null;
        return data?.sms_sender_id ?? null;
      }),
      catchError(() => from([null])),
    );
  }

  saveChurchSenderId(churchId: string, senderId: string): Observable<void> {
    // Enforce 11-char max (Hubtel limit; GiantSMS is more lenient but 11 is safe for both)
    const trimmed = senderId.trim().substring(0, 11);
    return from(
      this.supabase.client
        .from('churches')
        .update({ sms_sender_id: trimmed || null })
        .eq('id', churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Send test SMS via edge function ────────────────────────────────────────
  // Calls a lightweight test endpoint so the super admin can verify
  // credentials without sending to real members.

  sendTestSms(phone: string, provider: SmsProvider): Observable<SmsTestResult> {
    return from(
      this.supabase.client.functions.invoke('test-sms-provider', {
        body: { phone, provider },
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as SmsTestResult;
      }),
      catchError((err) => throwError(() => err)),
    );
  }
}


