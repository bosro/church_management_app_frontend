import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Location } from '@angular/common';
import { generateAcademicYears, TERMS } from '../../../../../models/school.model';
import { SupabaseService } from '../../../../../core/services/supabase';
import { AuthService } from '../../../../../core/services/auth';
import { FeedingFilterService } from '../../../services/feeding-filter.service';

interface Holiday {
  id: string;
  name: string;
  from_date: string;
  to_date: string;
}

@Component({
  selector: 'app-feeding-settings',
  standalone: false,
  templateUrl: './feeding-settings.html',
  styleUrl: './feeding-settings.scss',
})
export class FeedingSettings implements OnInit {
  churchId = '';
  publicLink = '';
  loading = true;
  successMessage = '';
  errorMessage = '';

  terms = TERMS;
  academicYears = generateAcademicYears();

  // Settings from the database
  hasPin = false;
  pinUpdatedAt: string | null = null;
  activeSessions = 0;
  activeYear = '';
  activeTerm = '';
  termUpdatedAt: string | null = null;

  // Forms
  newPin = '';
  justSetPin = '';
  savingPin = false;
  termYear = '';
  termTerm = '';
  savingTerm = false;

  holidays: Holiday[] = [];
  holidayName = '';
  holidayFrom = '';
  holidayTo = '';
  savingHoliday = false;

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private location: Location,
    private feedingFilter: FeedingFilterService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.churchId = this.auth.getChurchId() || '';
    this.publicLink = `${window.location.origin}/public/feeding-fees/${this.churchId}`;
    this.termYear = this.feedingFilter.year;
    this.termTerm = this.feedingFilter.term;
    this.reload();
  }

  goBack(): void {
    this.location.back();
  }

  private flash(kind: 'ok' | 'err', msg: string): void {
    if (kind === 'ok') {
      this.successMessage = msg;
      this.errorMessage = '';
      setTimeout(() => (this.successMessage = ''), 5000);
    } else {
      this.errorMessage = msg;
      this.successMessage = '';
    }
    this.cdr.markForCheck();
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      const { data, error } = await this.supabase.client.rpc('feeding_admin_get_settings', {
        p_church_id: this.churchId,
      });
      if (error) throw new Error(error.message);
      this.hasPin = !!data?.has_pin;
      this.pinUpdatedAt = data?.pin_updated_at || null;
      this.activeSessions = Number(data?.active_sessions || 0);
      this.activeYear = data?.active_year || '';
      this.activeTerm = data?.active_term || '';
      this.termUpdatedAt = data?.term_updated_at || null;
      if (this.activeYear && this.activeTerm) {
        this.termYear = this.activeYear;
        this.termTerm = this.activeTerm;
      }
      await this.loadHolidays();
    } catch (e: any) {
      this.flash(
        'err',
        (e.message || 'Could not load settings') +
          ' — if this is the first time, make sure the Phase A SQL has been run.',
      );
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  // ── PIN ───────────────────────────────────────────────────────
  generatePin(): void {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    this.newPin = String(n).padStart(6, '0');
  }

  get pinValid(): boolean {
    return /^[0-9]{4,8}$/.test(this.newPin);
  }

  async savePin(): Promise<void> {
    if (!this.pinValid || this.savingPin) return;
    if (
      this.hasPin &&
      !confirm('Changing the PIN signs out every teacher who is currently logged in. Continue?')
    )
      return;
    this.savingPin = true;
    try {
      const { error } = await this.supabase.client.rpc('feeding_admin_set_pin', {
        p_church_id: this.churchId,
        p_pin: this.newPin,
      });
      if (error) throw new Error(error.message);
      this.justSetPin = this.newPin;
      this.newPin = '';
      this.flash('ok', 'PIN saved. Share it with your teachers.');
      await this.reload();
    } catch (e: any) {
      this.flash('err', e.message || 'Failed to save PIN');
    } finally {
      this.savingPin = false;
      this.cdr.markForCheck();
    }
  }

  async disableAccess(): Promise<void> {
    if (!confirm('Turn off teacher access? Nobody will be able to open the teacher page until you set a new PIN.'))
      return;
    try {
      const { error } = await this.supabase.client.rpc('feeding_admin_disable_access', {
        p_church_id: this.churchId,
      });
      if (error) throw new Error(error.message);
      this.justSetPin = '';
      this.flash('ok', 'Teacher access turned off.');
      await this.reload();
    } catch (e: any) {
      this.flash('err', e.message || 'Failed');
    }
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.publicLink).then(() => this.flash('ok', 'Teacher link copied'));
  }

  // ── Active term ───────────────────────────────────────────────
  async saveTerm(): Promise<void> {
    if (this.savingTerm) return;
    this.savingTerm = true;
    try {
      const { error } = await this.supabase.client.rpc('feeding_admin_set_term', {
        p_church_id: this.churchId,
        p_year: this.termYear,
        p_term: this.termTerm,
      });
      if (error) throw new Error(error.message);
      this.feedingFilter.setBoth(this.termTerm, this.termYear); // keep admin pages in step
      this.flash('ok', `Active term set to ${this.termTerm} · ${this.termYear}. Teachers will be asked to confirm it.`);
      await this.reload();
    } catch (e: any) {
      this.flash('err', e.message || 'Failed to save term');
    } finally {
      this.savingTerm = false;
      this.cdr.markForCheck();
    }
  }

  // ── Holidays ──────────────────────────────────────────────────
  async loadHolidays(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('feeding_holidays')
      .select('id, name, from_date, to_date')
      .eq('church_id', this.churchId)
      .order('from_date', { ascending: false });
    if (error) throw new Error(error.message);
    this.holidays = data || [];
  }

  get holidayValid(): boolean {
    return (
      !!this.holidayName.trim() &&
      !!this.holidayFrom &&
      (!this.holidayTo || this.holidayTo >= this.holidayFrom)
    );
  }

  async addHoliday(): Promise<void> {
    if (!this.holidayValid || this.savingHoliday) return;
    this.savingHoliday = true;
    try {
      const { error } = await this.supabase.client.from('feeding_holidays').insert({
        church_id: this.churchId,
        name: this.holidayName.trim(),
        from_date: this.holidayFrom,
        to_date: this.holidayTo || this.holidayFrom,
      });
      if (error) throw new Error(error.message);
      this.holidayName = '';
      this.holidayFrom = '';
      this.holidayTo = '';
      this.flash('ok', 'Holiday added. It no longer counts as a school day.');
      await this.loadHolidays();
    } catch (e: any) {
      this.flash('err', e.message || 'Failed to add holiday');
    } finally {
      this.savingHoliday = false;
      this.cdr.markForCheck();
    }
  }

  async removeHoliday(h: Holiday): Promise<void> {
    if (!confirm(`Remove "${h.name}"? These days will count as school days again.`)) return;
    try {
      const { error } = await this.supabase.client.from('feeding_holidays').delete().eq('id', h.id);
      if (error) throw new Error(error.message);
      this.flash('ok', 'Holiday removed.');
      await this.loadHolidays();
    } catch (e: any) {
      this.flash('err', e.message || 'Failed to remove holiday');
    }
    this.cdr.markForCheck();
  }
}
