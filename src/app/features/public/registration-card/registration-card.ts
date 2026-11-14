// src/app/features/public/registration-card/registration-card.ts
// Public page opened from the link in the confirmation SMS: /public/card/:code
// Shows the registrant's details on a card (same look as the registrations list) with a "Save as image" button.
import { Component, OnInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

interface RegCard {
  found: boolean;
  name: string;
  email?: string | null;
  phone?: string | null;
  registration_code?: string | null;
  checked_in: boolean;
  registered_at: string;
  event_title: string;
  event_start: string;
  event_end?: string | null;
  event_location?: string | null;
  church_name?: string | null;
  church_logo?: string | null;
}

@Component({
  selector: 'app-public-registration-card',
  standalone: false,
  templateUrl: './registration-card.html',
  styleUrl: './registration-card.scss',
})
export class PublicRegistrationCard implements OnInit {
  @ViewChild('qrHolder') qrHolder?: ElementRef<HTMLElement>;
  state: 'loading' | 'notfound' | 'ready' = 'loading';
  card: RegCard | null = null;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code') || '';
    try {
      const { data, error } = await this.supabase.client.rpc('get_registration_card', { p_code: code });
      if (error || !data?.found) {
        this.state = 'notfound';
      } else {
        this.card = data as RegCard;
        this.state = 'ready';
      }
    } catch {
      this.state = 'notfound';
    }
    this.cdr.detectChanges();
  }

  /** What the QR contains: this card's own link (a normal phone camera opens the card; the gate scanner reads the code from it). */
  get cardUrl(): string {
    return window.location.origin + window.location.pathname;
  }

  get initials(): string {
    const parts = (this.card?.name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  }

  /** Draws the card onto a canvas and downloads it as a PNG (no extra library needed). */
  async saveAsImage(): Promise<void> {
    const c = this.card;
    if (!c) return;
    const W = 900, pad = 56, scale = 2;
    const fmtDate = new Date(c.event_start).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const t = new Date(c.event_start);
    const hasTime = !(t.getHours() === 0 && t.getMinutes() === 0);
    const when = hasTime
      ? `${fmtDate} · ${t.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}`
      : fmtDate;

    const rows: [string, string][] = [];
    if (c.email) rows.push(['Email', c.email]);
    if (c.phone) rows.push(['Phone', c.phone]);
    rows.push(['Registered', new Date(c.registered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })]);
    if (c.event_location) rows.push(['Location', c.event_location]);

    const qrCanvas = this.qrHolder?.nativeElement.querySelector('canvas') as HTMLCanvasElement | null;
    const H = 520 + rows.length * 64 + (qrCanvas ? 300 : 0);
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    const x = cv.getContext('2d')!;
    x.scale(scale, scale);
    const font = '"Nunito Sans", Arial, sans-serif';

    x.fillStyle = '#EEF2FF'; x.fillRect(0, 0, W, H);
    this.round(x, 24, 24, W - 48, H - 48, 28); x.fillStyle = '#FFFFFF'; x.fill();
    // top band
    x.save(); this.round(x, 24, 24, W - 48, 150, 28); x.clip();
    x.fillStyle = '#5B21B6'; x.fillRect(24, 24, W - 48, 150); x.restore();
    x.fillStyle = '#FFFFFF'; x.font = `700 26px ${font}`; x.fillText(c.church_name || '', pad, 80);
    x.font = `800 36px ${font}`; x.fillText(this.fit(x, c.event_title, W - pad * 2), pad, 130);
    x.font = `600 22px ${font}`; x.fillStyle = '#DDD6FE'; x.fillText(when, pad, 164);

    // avatar + name
    x.beginPath(); x.arc(pad + 40, 250, 40, 0, Math.PI * 2); x.fillStyle = '#EDE9FE'; x.fill();
    x.fillStyle = '#5B21B6'; x.font = `800 32px ${font}`; x.textAlign = 'center'; x.fillText(this.initials, pad + 40, 262);
    x.textAlign = 'left'; x.fillStyle = '#111827'; x.font = `800 34px ${font}`;
    x.fillText(this.fit(x, c.name, W - pad * 2 - 110), pad + 100, 262);

    // big ID
    let y = 340;
    x.fillStyle = '#6B7280'; x.font = `700 20px ${font}`; x.fillText('ID NUMBER', pad, y);
    x.fillStyle = '#5B21B6'; x.font = `900 64px ${font}`; x.fillText(c.registration_code || '—', pad, y + 66);
    y += 120;

    x.strokeStyle = '#E5E7EB'; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, y); x.lineTo(W - pad, y); x.stroke();
    y += 50;
    for (const [label, value] of rows) {
      x.fillStyle = '#6B7280'; x.font = `700 18px ${font}`; x.fillText(label.toUpperCase(), pad, y);
      x.fillStyle = '#111827'; x.font = `600 24px ${font}`; x.fillText(this.fit(x, value, W - pad * 2), pad, y + 30);
      y += 64;
    }
    if (qrCanvas) {
      const qs = 220;
      x.fillStyle = '#FFFFFF'; x.fillRect((W - qs) / 2 - 12, y - 24, qs + 24, qs + 24);
      x.drawImage(qrCanvas, (W - qs) / 2, y - 12, qs, qs);
      x.textAlign = 'center'; x.fillStyle = '#6B7280'; x.font = `600 20px ${font}`;
      x.fillText('Show this QR code at the entrance', W / 2, y + qs + 28);
      x.textAlign = 'left';
    }
    x.fillStyle = '#059669'; x.font = `800 22px ${font}`;
    x.fillText(c.checked_in ? '✔ Checked in' : '✔ Registered', pad, H - 64);

    const a = document.createElement('a');
    a.download = `registration-${c.registration_code || 'card'}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  private fit(x: CanvasRenderingContext2D, text: string, max: number): string {
    if (x.measureText(text).width <= max) return text;
    let s = text;
    while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  private round(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
}