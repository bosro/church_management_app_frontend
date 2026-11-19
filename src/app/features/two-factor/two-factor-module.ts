// src/app/features/two-factor/two-factor-module.ts  (module + page in one file)
import { NgModule, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase';
import { TwoFactorService } from '../../core/services/two-factor-service';

@Component({
  selector: 'app-two-factor-page',
  standalone: false,
  template: `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f3ff;padding:1rem;font-family:system-ui,sans-serif">
    <div style="background:#fff;border-radius:16px;padding:2rem;width:100%;max-width:400px;box-shadow:0 10px 40px #5b21b61a;text-align:center">
      <h2 style="margin:0 0 .5rem">Verify it's you</h2>
      <p *ngIf="to" style="color:#6b7280;margin:0 0 1.25rem">We sent a 6-digit code by {{ channel }} to <b>{{ to }}</b>.</p>
      <p *ngIf="!to && !err" style="color:#6b7280">Sending your code…</p>
      <input [(ngModel)]="code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" (keyup.enter)="verify()"
        style="width:100%;font-size:1.8rem;letter-spacing:.6rem;text-align:center;padding:.6rem;border:2px solid #ddd6fe;border-radius:12px" placeholder="••••••">
      <p *ngIf="err" style="color:#b91c1c;margin:.75rem 0 0">{{ err }}</p>
      <button (click)="verify()" [disabled]="busy || code.length !== 6"
        style="margin-top:1rem;width:100%;padding:.8rem;border:0;border-radius:12px;background:#5b21b6;color:#fff;font-weight:700;cursor:pointer">
        {{ busy ? 'Checking…' : 'Verify' }}</button>
      <p style="margin-top:1rem;font-size:.9rem">
        <a href="javascript:void(0)" (click)="resend()" *ngIf="wait === 0">Send a new code</a>
        <span *ngIf="wait > 0" style="color:#9ca3af">New code in {{ wait }}s</span>
        &nbsp;·&nbsp; <a href="javascript:void(0)" (click)="logout()">Sign out</a></p>
    </div>
  </div>`,
})
export class TwoFactorPage implements OnInit, OnDestroy {
  code = ''; err = ''; to = ''; channel = ''; busy = false; wait = 0; private t: any;
  constructor(private tf: TwoFactorService, private router: Router, private route: ActivatedRoute, private supabase: SupabaseService) {}

  async ngOnInit() { await this.resend(); }
  ngOnDestroy() { clearInterval(this.t); }

  async resend() {
    this.err = '';
    const r = await this.tf.send();
    if (r.success) { this.to = r.to || ''; this.channel = r.channel || 'email'; this.startWait(); }
    else this.err = r.error || 'Could not send the code';
  }
  private startWait() {
    this.wait = 30; clearInterval(this.t);
    this.t = setInterval(() => { this.wait--; if (this.wait <= 0) clearInterval(this.t); }, 1000);
  }
  async verify() {
    this.busy = true; this.err = '';
    const r = await this.tf.verify(this.code);
    this.busy = false;
    if (!r.success) { this.err = r.error || 'Wrong code'; return; }
    this.tf.markOk();
    this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/main');
  }
  async logout() { await this.supabase.client.auth.signOut(); this.router.navigate(['/auth/signin']); }
}

@NgModule({
  declarations: [TwoFactorPage],
  imports: [CommonModule, FormsModule, RouterModule.forChild([{ path: '', component: TwoFactorPage }])],
})
export class TwoFactorModule {}