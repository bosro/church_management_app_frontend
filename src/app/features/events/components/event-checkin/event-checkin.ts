
// src/app/features/events/components/event-checkin/event-checkin.ts
// Gate check-in screen: scan a registration QR with the camera, or type the ID number.
// Route: /main/events/:id/check-in   (needs:  npm i jsqr)
import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import jsQR from 'jsqr';
import { EventsService } from '../../services/events';
import { ToastService } from '../../../../core/services/toast.service';

type ResultKind = 'ok' | 'already' | 'error';
interface ScanResult {
  kind: ResultKind;
  title: string;
  detail?: string;
  reg?: { id: string; name: string; registration_code: string; checked_in_at?: string };
}

@Component({
  selector: 'app-event-checkin',
  standalone: false,
  templateUrl: './event-checkin.html',
  styleUrl: './event-checkin.scss',
})
export class EventCheckin implements OnInit, OnDestroy {
  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('frame') frameRef?: ElementRef<HTMLCanvasElement>;

  eventId = '';
  eventTitle = '';
  eventDate = '';
  stats = { checked_in: 0, total_registrations: 0 };
  recent: any[] = [];

  cameraOn = false;
  cameraStarting = false;
  cameraError = '';
  manualId = '';
  busy = false;
  result: ScanResult | null = null;
  undoTarget: { id: string; name: string } | null = null;
  undoing = false;

  private stream: MediaStream | null = null;
  private timer: any = null;
  private lastText = '';
  private lastAt = 0;
  private audio: AudioContext | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private events: EventsService,
    private toast: ToastService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('id') || '';
    this.events.getEventById(this.eventId).subscribe({
      next: (e) => {
        this.eventTitle = e.title;
        this.eventDate = e.start_date;
      },
      error: () => this.toast.error('Could not load the event'),
    });
    this.refresh();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  get isToday(): boolean {
    if (!this.eventDate) return true;
    const d = new Date(this.eventDate), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  back(): void {
    this.router.navigate(['main', 'events', this.eventId]);
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  async startCamera(): Promise<void> {
    if (this.cameraOn || this.cameraStarting) return;
    this.cameraError = '';
    this.cameraStarting = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      this.cameraOn = true;
      this.cameraStarting = false;
      // wait for the <video> to exist
      await new Promise((r) => setTimeout(r));
      const v = this.videoRef!.nativeElement;
      v.srcObject = this.stream;
      await v.play();
      this.zone.runOutsideAngular(() => this.scanLoop());
    } catch (e: any) {
      this.cameraStarting = false;
      this.cameraOn = false;
      this.stopCamera();
      this.cameraError =
        e?.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow the camera for this site in your browser settings, or type the ID number below.'
          : 'The camera could not be started on this device. You can still type the ID number below.';
    }
  }

  stopCamera(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.cameraOn = false;
  }

  private scanLoop(): void {
    const v = this.videoRef?.nativeElement;
    const cv = this.frameRef?.nativeElement;
    if (!v || !cv || !this.stream) return;
    if (v.readyState >= 2 && v.videoWidth) {
      const w = Math.min(640, v.videoWidth);
      const h = Math.round((v.videoHeight / v.videoWidth) * w);
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        const now = Date.now();
        // ignore the same code being read again within 6 seconds
        if (code.data !== this.lastText || now - this.lastAt > 6000) {
          this.lastText = code.data;
          this.lastAt = now;
          this.zone.run(() => this.process(code.data, 'qr'));
        }
      }
    }
    this.timer = setTimeout(() => this.scanLoop(), 150);
  }

  // ── Check in ─────────────────────────────────────────────────────────────
  submitManual(): void {
    const id = this.manualId.trim();
    if (!id) return;
    this.process(id, 'id');
  }

  private async process(input: string, method: 'qr' | 'id'): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.events.checkInByCode(this.eventId, input, method);
      if (r.status === 'ok') {
        this.result = { kind: 'ok', title: r.name, detail: 'Checked in', reg: r };
        this.feedback(true);
        if (method === 'id') this.manualId = '';
      } else if (r.status === 'already') {
        this.result = {
          kind: 'already',
          title: r.name,
          detail: 'Already checked in at ' + new Date(r.checked_in_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase(),
          reg: r,
        };
        this.feedback(false);
      } else {
        this.result = { kind: 'error', title: r.status === 'cancelled' ? (r.name || 'Cancelled') : 'Not found', detail: r.message || 'Could not check in.' };
        this.feedback(false);
      }
    } catch (e: any) {
      this.result = { kind: 'error', title: 'Something went wrong', detail: e?.message || 'Please try again.' };
      this.feedback(false);
    }
    this.busy = false;
    this.refresh();
  }

  dismissResult(): void {
    this.result = null;
  }

  // ── Undo ────────────────────────────────────────────────────────────────
  askUndo(reg: { id: string; name: string }): void {
    this.undoTarget = { id: reg.id, name: reg.name };
  }

  cancelUndo(): void {
    if (!this.undoing) this.undoTarget = null;
  }

  async confirmUndo(): Promise<void> {
    const t = this.undoTarget;
    if (!t || this.undoing) return;
    this.undoing = true;
    try {
      await this.events.undoCheckIn(t.id);
      this.toast.success('Check-in undone', `${t.name} is no longer marked as checked in.`);
      if (this.result?.reg?.id === t.id) this.result = null;
      this.lastText = ''; // allow scanning this person again straight away
    } catch (e: any) {
      this.toast.error('Could not undo', e?.message || 'Please try again.');
    }
    this.undoing = false;
    this.undoTarget = null;
    this.refresh();
  }

  // ── Data ────────────────────────────────────────────────────────────────
  private refresh(): void {
    this.events.getEventStatistics(this.eventId).subscribe((s) => (this.stats = s));
    this.events.getEventRegistrations(this.eventId).subscribe((rows) => {
      this.recent = rows
        .filter((r) => r.checked_in)
        .sort((a, b) => +new Date(b.checked_in_at || 0) - +new Date(a.checked_in_at || 0))
        .slice(0, 10);
    });
  }

  nameOf(r: any): string {
    return r.name || [r.member?.first_name, r.member?.last_name].filter(Boolean).join(' ') || 'Guest';
  }

  // ── Beep + buzz so the person at the gate knows without looking ─────────
  private feedback(good: boolean): void {
    try { navigator.vibrate?.(good ? 120 : [80, 60, 80]); } catch { /* not supported */ }
    try {
      this.audio = this.audio || new AudioContext();
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.frequency.value = good ? 880 : 300;
      g.gain.value = 0.08;
      o.connect(g); g.connect(this.audio.destination);
      o.start(); o.stop(this.audio.currentTime + (good ? 0.15 : 0.3));
    } catch { /* no audio */ }
  }
}