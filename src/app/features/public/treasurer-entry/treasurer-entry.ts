// Treasurer "Service Entry": record payments received during church service.
// Used by BOTH routes:
//   /public/treasurer/:churchId     -> PIN screen, then the entry screen (like the teacher feeding page)
//   /main/finance/service-entry     -> signed-in finance officer / church admin, no PIN
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription, filter, firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import {
  MemberHit,
  RecordResult,
  TodayRow,
  TodaySummary,
  TreasurerBootstrap,
  TreasurerPublicService,
} from './treasurer-public.service';

type Screen = 'loading' | 'off' | 'pin' | 'ready' | 'error';
type Who = 'member' | 'visitor' | 'anonymous';
interface Line { category_id: string; amount: string }

const NAME_KEY = 'churchman_treasurer_name';

@Component({
  selector: 'app-treasurer-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './treasurer-entry.html',
  styleUrl: './treasurer-entry.scss',
})
export class TreasurerEntry implements OnInit, OnDestroy {
  screen: Screen = 'loading';
  isPublic = true;
  churchId: string | null = null;
  churchName = '';
  errorText = '';

  // PIN screen
  recorderName = '';
  requiresPin = true;      // false when the church chose an open link (name only)
  pin = '';
  pinError = '';
  attemptsLeft: number | null = null;
  verifying = false;

  // entry screen
  boot: TreasurerBootstrap | null = null;
  who: Who = 'member';
  query = '';
  hits: MemberHit[] = [];
  searching = false;
  member: MemberHit | null = null;
  visitorName = '';
  visitorPhone = '';
  lines: Line[] = [{ category_id: '', amount: '' }];
  method = 'cash';
  date = '';
  showDate = false;
  showMore = false;
  reference = '';
  notes = '';

  saving = false;
  saveError = '';
  lastSaved: RecordResult | null = null;
  clientKey = this.newKey();

  today: TodaySummary | null = null;
  loadingToday = false;
  undoingId: string | null = null;

  private starting = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;
  private sub?: Subscription;

  constructor(private route: ActivatedRoute, private svc: TreasurerPublicService, private auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    this.churchId = this.route.snapshot.paramMap.get('churchId');
    this.isPublic = !!this.churchId;
    this.svc.init(this.churchId || 'staff');
    this.sub = this.svc.sessionExpired$.subscribe(() => this.onExpired());
    try { this.recorderName = localStorage.getItem(NAME_KEY) || ''; } catch { /* ignore */ }
    await this.start();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  // ── opening ─────────────────────────────────────────────────
  private newKey(): string {
    try { return crypto.randomUUID(); } catch {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
  }

  /** The signed-in session is restored a moment after the page starts; wait for it before the first request. */
  private async waitForAuth(): Promise<void> {
    try {
      await firstValueFrom(this.auth.authReady$.pipe(filter(Boolean), timeout(10000)));
    } catch { /* carry on; the server will say if we are not signed in */ }
  }

  async start(): Promise<void> {
    this.starting = true;
    this.screen = 'loading';
    this.errorText = '';
    try {
      if (!this.isPublic) {
        await this.waitForAuth();
        const r = await this.svc.openStaffSession();
        if (!r.ok) { this.errorText = r.error || 'You cannot use Service Entry.'; this.screen = 'error'; return; }
        await this.enter();
        return;
      }
      if (this.svc.getToken()) {
        try { await this.enter(); return; } catch { /* token no longer good: ask for the PIN */ }
      }
      const info = await this.svc.accessInfo(this.churchId!);
      this.churchName = info.church_name || '';
      this.requiresPin = info.requires_pin !== false;
      this.screen = info.enabled ? 'pin' : 'off';
    } catch (e: any) {
      this.errorText = e?.message || 'Something went wrong. Please try again.';
      this.screen = 'error';
    } finally {
      this.starting = false;
    }
  }

  private onExpired(): void {
    if (this.starting) return;
    if (this.isPublic) {
      this.pin = '';
      this.pinError = 'Your session ended. Please sign in again.';
      this.screen = 'pin';
      // the church may have changed between "PIN" and "open link", or switched the link off
      this.svc.accessInfo(this.churchId!).then((i) => {
        this.requiresPin = i.requires_pin !== false;
        if (!i.enabled) this.screen = 'off';
      }).catch(() => {});
    } else {
      this.start();
    }
  }

  async submitPin(): Promise<void> {
    if (this.verifying || this.recorderName.trim().length < 2 || (this.requiresPin && !this.pin.trim())) return;
    this.verifying = true;
    this.pinError = '';
    try {
      const name = this.recorderName.trim();
      const r = this.requiresPin
        ? await this.svc.verifyPin(this.churchId!, this.pin.trim(), name)
        : await this.svc.openSession(this.churchId!, name);
      if (r.ok) {
        try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
        this.pin = '';
        this.attemptsLeft = null;
        this.starting = true;
        try { await this.enter(); } finally { this.starting = false; }
      } else {
        this.pinError = r.error || (this.requiresPin ? 'That PIN is not correct.' : 'Could not sign in.');
        this.attemptsLeft = (r as { attempts_left?: number }).attempts_left ?? null;
        this.pin = '';
      }
    } catch (e: any) {
      this.pinError = e?.message || 'Could not sign in. Please try again.';
    } finally {
      this.verifying = false;
    }
  }

  private async enter(): Promise<void> {
    this.boot = await this.svc.bootstrap();
    this.churchName = this.boot.church_name;
    this.date = this.boot.server_today;
    this.resetForm(true);
    this.screen = 'ready';
    // from here on a "session ended" signal must be acted on (the list below may still be loading)
    this.starting = false;
    await this.loadToday();
  }

  async endSession(): Promise<void> {
    if (!confirm('End this session? You will need the PIN again to record more.')) return;
    await this.svc.endSession();
    this.boot = null;
    this.today = null;
    this.pin = '';
    this.pinError = '';
    this.screen = 'pin';
  }

  // ── choosing who gave ───────────────────────────────────────
  setWho(w: Who): void {
    this.who = w;
    this.saveError = '';
    if (w !== 'member') { this.member = null; this.query = ''; this.hits = []; }
  }

  onQuery(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const q = this.query.trim();
    if (q.length < 2) { this.hits = []; this.searching = false; return; }
    this.searching = true;
    const seq = ++this.searchSeq;
    this.searchTimer = setTimeout(async () => {
      try {
        const r = await this.svc.searchMembers(q);
        if (seq === this.searchSeq) this.hits = r;
      } catch (e: any) {
        if (e?.message !== 'SESSION_EXPIRED') this.saveError = e?.message || 'Search failed.';
      } finally {
        if (seq === this.searchSeq) this.searching = false;
      }
    }, 300);
  }

  pickMember(m: MemberHit): void {
    this.member = m;
    this.query = '';
    this.hits = [];
    this.saveError = '';
  }

  clearMember(): void { this.member = null; }

  // ── lines (a person can give to several categories at once) ──
  addLine(): void { if (this.lines.length < 8) this.lines.push({ category_id: '', amount: '' }); }
  removeLine(i: number): void { if (this.lines.length > 1) this.lines.splice(i, 1); }

  get total(): number {
    return Math.round(this.lines.reduce((s, l) => s + (Number(l.amount) > 0 ? Number(l.amount) : 0), 0) * 100) / 100;
  }

  get minDate(): string {
    if (!this.boot) return '';
    const d = new Date(`${this.boot.server_today}T00:00:00`);
    d.setDate(d.getDate() - this.boot.max_backdate_days);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  get dateIsToday(): boolean { return !!this.boot && this.date === this.boot.server_today; }

  get problem(): string {
    if (!this.boot) return '';
    if (this.who === 'member' && !this.member) return 'Choose the member (or switch to Visitor / Anonymous).';
    if (this.who === 'visitor' && this.visitorName.trim().length < 2) return 'Enter the visitor’s name.';
    for (const l of this.lines) {
      const n = Number(l.amount);
      if (!l.category_id) return 'Choose a category for every amount.';
      if (!(n > 0)) return 'Enter an amount for every line.';
      if (n > this.boot.max_amount) return `One amount cannot be more than ${this.money(this.boot.max_amount)}.`;
    }
    if (!this.date || this.date > this.boot.server_today || this.date < this.minDate) return 'Pick a valid date.';
    return '';
  }

  get canSave(): boolean { return !this.problem && !this.saving; }

  // ── saving ──────────────────────────────────────────────────
  async save(): Promise<void> {
    if (!this.canSave) return;
    this.saving = true;
    this.saveError = '';
    try {
      const r = await this.svc.record({
        memberId: this.who === 'member' ? this.member!.id : null,
        payerName: this.who === 'visitor' ? this.visitorName.trim() : null,
        payerContact: this.who === 'visitor' ? this.visitorPhone.trim() || null : null,
        method: this.method,
        date: this.date,
        reference: this.reference.trim() || null,
        notes: this.notes.trim() || null,
        lines: this.lines.map((l) => ({ category_id: l.category_id, amount: Number(l.amount) })),
        clientKey: this.clientKey,   // same key on a retry => it can never be saved twice
      });
      if (r.success) {
        this.lastSaved = r;
        this.resetForm(false);
        await this.loadToday();
      } else {
        this.saveError = r.error || 'Could not save.';
      }
    } catch (e: any) {
      if (e?.message === 'SESSION_EXPIRED') {
        this.saveError = 'Your session ended. Sign in again and check today’s list before entering this again.';
      } else {
        // network problem: the key is kept, so pressing Save again is safe
        this.saveError = (e?.message || 'No connection.') + ' Press Save again — it will not be recorded twice.';
      }
    } finally {
      this.saving = false;
    }
  }

  /** after a save: clear the person and amounts, keep method and date for the next one */
  private resetForm(keepSaved: boolean): void {
    this.who = 'member';
    this.member = null;
    this.query = '';
    this.hits = [];
    this.visitorName = '';
    this.visitorPhone = '';
    this.lines = [{ category_id: '', amount: '' }];
    this.reference = '';
    this.notes = '';
    this.showMore = false;
    this.clientKey = this.newKey();
    if (keepSaved) this.lastSaved = null;
  }

  // ── today's entries ─────────────────────────────────────────
  async loadToday(): Promise<void> {
    this.loadingToday = true;
    try {
      this.today = await this.svc.today(this.dateIsToday ? undefined : this.date);
    } catch { /* shown as empty; expiry is handled elsewhere */ } finally {
      this.loadingToday = false;
    }
  }

  async undo(r: TodayRow): Promise<void> {
    if (!confirm(`Remove ${this.money(r.amount)} from ${r.who}? Use this only for a mistake.`)) return;
    this.undoingId = r.id;
    this.saveError = '';
    try {
      const res = await this.svc.undo(r.id);
      if (!res.success) this.saveError = res.error || 'Could not remove it.';
      await this.loadToday();
    } catch (e: any) {
      if (e?.message !== 'SESSION_EXPIRED') this.saveError = e?.message || 'Could not remove it.';
    } finally {
      this.undoingId = null;
    }
  }

  // ── display helpers ─────────────────────────────────────────
  money(n: number | null | undefined): string {
    const cur = this.boot?.currency || 'GHS';
    return `${cur} ${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  methodLabel(v: string | null | undefined): string {
    return this.boot?.methods.find((m) => m.value === v)?.label || (v || '').replace(/_/g, ' ');
  }

  get dateLabel(): string {
    if (!this.date) return '';
    return new Date(`${this.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  trackByIndex(i: number): number { return i; }
}
