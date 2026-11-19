// core/services/two-factor.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({ providedIn: 'root' })
export class TwoFactorService {
  private okSession: string | null = null;   // remembers "verified" for this browser session only
  constructor(private supabase: SupabaseService) {}

  /** true = the user may continue; false = they must enter a code first */
  async isSatisfied(): Promise<boolean> {
    const { data: s } = await this.supabase.client.auth.getSession();
    const token = s.session?.access_token || '';
    if (this.okSession && this.okSession === token.slice(-24)) return true;
    const { data, error } = await this.supabase.client.rpc('two_factor_status');
    if (error || !data) return true;            // never lock people out if the migration isn't applied yet
    if (!data.required || data.ok) { this.okSession = token.slice(-24); return true; }
    return false;
  }
  markOk(): void { this.okSession = null; }      // re-check next time (token changes after verify anyway)

  async send(): Promise<{ success: boolean; error?: string; to?: string; channel?: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('two-factor', { body: { action: 'send' } });
    return (data as any) ?? { success: false, error: error?.message || 'Could not send the code' };
  }
  async verify(code: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('two-factor', { body: { action: 'verify', code } });
    return (data as any) ?? { success: false, error: error?.message || 'Could not verify' };
  }
}