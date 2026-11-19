// shared/components/branding-card/branding-card.ts — standalone, put <app-branding-card> in Settings and import it in SettingsModule
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-branding-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1.25rem;max-width:640px">
    <h3 style="margin:0 0 .25rem">Brand colour</h3>
    <p style="color:#6b7280;margin:0 0 1rem;font-size:.9rem">Used on your public giving page, registration pages and church website. Your logo is set under Church Information.</p>
    <div *ngIf="!allowed" style="background:#fef3c7;border-radius:10px;padding:.7rem;font-size:.9rem">Custom branding is included in higher plans. Upgrade to use your own colour and remove “Powered by Churchman”.</div>
    <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap" [style.opacity]="allowed ? 1 : .5">
      <input type="color" [(ngModel)]="color" [disabled]="!allowed" style="width:64px;height:44px;border:0;padding:0">
      <input [(ngModel)]="color" [disabled]="!allowed" placeholder="#5b21b6" style="padding:.5rem;border:1px solid #d1d5db;border-radius:8px;width:120px">
      <span [style.background]="color" style="padding:.45rem 1rem;border-radius:999px;color:#fff;font-weight:700">Give now</span>
    </div>
    <p *ngIf="msg" style="color:#15803d">{{ msg }}</p><p *ngIf="err" style="color:#b91c1c">{{ err }}</p>
    <button (click)="save()" [disabled]="!allowed || busy" style="margin-top:.8rem;padding:.55rem 1.2rem;border:0;border-radius:10px;background:#5b21b6;color:#fff;cursor:pointer">Save colour</button>
  </div>`,
})
export class BrandingCard implements OnInit {
  allowed = false; color = '#5b21b6'; busy = false; msg = ''; err = '';
  constructor(private supabase: SupabaseService) {}
  async ngOnInit() {
    const { data } = await this.supabase.client.rpc('get_my_branding');
    if (data) { this.allowed = !!data.allowed; this.color = data.color || '#5b21b6'; }
  }
  async save() {
    this.busy = true; this.msg = this.err = '';
    const { data, error } = await this.supabase.client.rpc('save_my_branding', { p_color: this.color });
    this.busy = false;
    if (error || !data?.success) this.err = error?.message || data?.error || 'Could not save'; else this.msg = 'Saved.';
  }
}