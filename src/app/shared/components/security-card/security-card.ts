
// shared/components/security-card/security-card.ts  — standalone: import it in SettingsModule `imports: [..., SecurityCard, BrandingCard]`
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-security-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1.25rem;max-width:640px">
    <h3 style="margin:0 0 .25rem">Two-factor sign-in (2FA)</h3>
    <p style="color:#6b7280;margin:0 0 1rem;font-size:.9rem">When on, everyone in your church must enter a 6-digit code after their password. Codes expire in 10 minutes.</p>
    <label style="display:flex;gap:.6rem;align-items:center;font-weight:600">
      <input type="checkbox" [(ngModel)]="enabled"> Require a code at sign-in</label>
    <div *ngIf="enabled" style="margin:.9rem 0 0 1.6rem">
      <label style="display:block"><input type="radio" name="ch" value="email" [(ngModel)]="channel"> Email</label>
      <label style="display:block;margin-top:.3rem"><input type="radio" name="ch" value="sms" [(ngModel)]="channel"> SMS to their phone number
        <small style="color:#6b7280">(users without a saved number get the code by email)</small></label>
    </div>
    <p *ngIf="msg" style="color:#15803d;margin:.75rem 0 0">{{ msg }}</p><p *ngIf="err" style="color:#b91c1c;margin:.75rem 0 0">{{ err }}</p>
    <button (click)="save()" [disabled]="busy" style="margin-top:1rem;padding:.55rem 1.2rem;border:0;border-radius:10px;background:#5b21b6;color:#fff;cursor:pointer">{{ busy ? 'Saving…' : 'Save' }}</button>
  </div>`,
})
export class SecurityCard implements OnInit {
  enabled = false; channel: 'email' | 'sms' = 'email'; busy = false; msg = ''; err = '';
  constructor(private supabase: SupabaseService) {}
  async ngOnInit() {
    const { data } = await this.supabase.client.rpc('get_two_factor_setting');
    if (data) { this.enabled = !!data.enabled; this.channel = data.channel || 'email'; }
  }
  async save() {
    this.busy = true; this.msg = this.err = '';
    const { error } = await this.supabase.client.rpc('set_two_factor', { p_enabled: this.enabled, p_channel: this.channel });
    this.busy = false;
    if (error) this.err = error.message; else this.msg = this.enabled ? '2FA is on. Everyone will be asked for a code at their next page load.' : '2FA is off.';
  }
}