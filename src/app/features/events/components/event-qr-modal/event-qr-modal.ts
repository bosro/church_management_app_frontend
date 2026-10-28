// Reusable modal: QR code for an event's public registration page.
// Used by the events list and the event detail page.
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { copyToClipboard, eventRegistrationUrl } from '../../../../core/utils/copy-to-clipboard';

@Component({
  selector: 'app-event-qr-modal',
  standalone: false,
  templateUrl: './event-qr-modal.html',
  styleUrl: './event-qr-modal.scss',
})
export class EventQrModal {
  @Input() eventId = '';
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();
  @ViewChild('qrBox') qrBox?: ElementRef<HTMLElement>;

  copied = false;
  message = '';

  get url(): string {
    return eventRegistrationUrl(this.eventId);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  async copy(): Promise<void> {
    const ok = await copyToClipboard(this.url);
    this.copied = ok;
    this.message = ok ? '' : 'Could not copy automatically. Select the link above and copy it.';
    if (ok) setTimeout(() => (this.copied = false), 2500);
  }

  /** Downloads a ready-to-share image: event title, QR code and a "scan to register" line. */
  download(): void {
    const qr = this.qrBox?.nativeElement.querySelector('canvas') as HTMLCanvasElement | null;
    if (!qr) {
      this.message = 'QR code is not ready yet. Try again in a moment.';
      return;
    }
    const W = 800, pad = 60, qrSize = 560;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = 960;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';

    // title, wrapped to at most 2 lines
    ctx.font = '800 44px Arial, sans-serif';
    const lines = this.wrap(ctx, this.title || 'Event', W - pad * 2, 2);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 100 + i * 54));

    const qrTop = 100 + lines.length * 54 + 20;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, (W - qrSize) / 2, qrTop, qrSize, qrSize);

    ctx.fillStyle = '#5B21B6';
    ctx.font = '700 36px Arial, sans-serif';
    ctx.fillText('Scan to register', W / 2, qrTop + qrSize + 70);

    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `event-qr-${(this.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'}.png`;
    a.click();
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '…');
    }
    return lines;
  }
}
