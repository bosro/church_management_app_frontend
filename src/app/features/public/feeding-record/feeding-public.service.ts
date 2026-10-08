import { Injectable } from '@angular/core';
import { Observable, Subject, from } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase';

export interface PinResult {
  ok: boolean;
  token?: string;
  error?: string;
  locked?: boolean;
  attempts_left?: number;
}

export interface FeedingHoliday {
  from_date: string;
  to_date: string;
  name: string;
}

export interface FeedingBootstrap {
  church_id: string;
  school_name: string;
  active_year: string | null;
  active_term: string | null;
  classes: { id: string; name: string; tier: string | null }[];
  window: { id: string; allow_from: string; allow_to: string; reason: string | null } | null;
  holidays: FeedingHoliday[];
  server_today: string;
}

/**
 * Everything the (logged-out) teacher page does goes through here.
 * Each call carries the PIN session token; the database checks it.
 * The teacher page never touches the feeding tables directly.
 */
@Injectable({ providedIn: 'root' })
export class FeedingPublicService {
  /** Emits when the database says the PIN session is no longer valid. */
  sessionExpired$ = new Subject<void>();

  private churchId = '';

  constructor(private supabase: SupabaseService) {}

  init(churchId: string): void {
    this.churchId = churchId;
  }

  // ── Token (kept for this browser tab only) ──────────────────────
  private tokenKey(): string {
    return `churchman_feeding_session_${this.churchId}`;
  }
  private termKey(): string {
    return `churchman_feeding_term_ok_${this.churchId}`;
  }

  getToken(): string | null {
    try {
      return sessionStorage.getItem(this.tokenKey());
    } catch {
      return null;
    }
  }
  private setToken(t: string): void {
    try {
      sessionStorage.setItem(this.tokenKey(), t);
    } catch {}
  }
  clearSession(): void {
    try {
      sessionStorage.removeItem(this.tokenKey());
      sessionStorage.removeItem(this.termKey());
    } catch {}
  }

  /** Has the teacher already confirmed this term in this tab? */
  isTermConfirmed(year: string, term: string): boolean {
    try {
      return sessionStorage.getItem(this.termKey()) === `${year}|${term}`;
    } catch {
      return false;
    }
  }
  markTermConfirmed(year: string, term: string): void {
    try {
      sessionStorage.setItem(this.termKey(), `${year}|${term}`);
    } catch {}
  }

  // ── Login ───────────────────────────────────────────────────────
  async verifyPin(pin: string): Promise<PinResult> {
    const { data, error } = await this.supabase.client.rpc('feeding_verify_pin', {
      p_church_id: this.churchId,
      p_pin: pin,
    });
    if (error) throw new Error(error.message);
    const res = data as PinResult;
    if (res.ok && res.token) this.setToken(res.token);
    return res;
  }

  // ── Generic caller ──────────────────────────────────────────────
  private async call<T>(fn: string, args: Record<string, any> = {}): Promise<T> {
    const token = this.getToken();
    if (!token) {
      this.sessionExpired$.next();
      throw new Error('SESSION_EXPIRED');
    }
    const { data, error } = await this.supabase.client.rpc(fn, {
      p_token: token,
      ...args,
    });
    if (error) {
      if ((error.message || '').includes('SESSION_EXPIRED')) {
        this.clearSession();
        this.sessionExpired$.next();
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error(error.message);
    }
    return data as T;
  }

  // ── Reads ───────────────────────────────────────────────────────
  bootstrap(): Promise<FeedingBootstrap> {
    return this.call<FeedingBootstrap>('feeding_pub_bootstrap');
  }
  async students(): Promise<any[]> {
    return (await this.call<any[]>('feeding_pub_students')) || [];
  }
  async fees(year: string, term: string): Promise<any[]> {
    return (await this.call<any[]>('feeding_pub_fees', { p_year: year, p_term: term })) || [];
  }
  async overview(date: string, year: string, term: string): Promise<any[]> {
    return (
      (await this.call<any[]>('feeding_pub_overview', {
        p_date: date,
        p_year: year,
        p_term: term,
      })) || []
    );
  }
  async collected(year: string, term: string, from: string, to: string): Promise<number> {
    const v = await this.call<number>('feeding_pub_collected', {
      p_year: year,
      p_term: term,
      p_from: from,
      p_to: to,
    });
    return Number(v || 0);
  }
  async studentPayments(studentId: string, year: string, term: string): Promise<any[]> {
    return (
      (await this.call<any[]>('feeding_pub_student_payments', {
        p_student: studentId,
        p_year: year,
        p_term: term,
      })) || []
    );
  }
  async expenses(year: string, term: string, from: string, to: string): Promise<any[]> {
    return (
      (await this.call<any[]>('feeding_pub_expenses', {
        p_year: year,
        p_term: term,
        p_from: from,
        p_to: to,
      })) || []
    );
  }

  // ── Writes ──────────────────────────────────────────────────────
  setAttendance(
    studentId: string,
    date: string,
    year: string,
    term: string,
    present: boolean,
  ): Promise<void> {
    return this.call<void>('feeding_pub_set_attendance', {
      p_student: studentId,
      p_date: date,
      p_year: year,
      p_term: term,
      p_present: present,
    });
  }

  recordPayment(p: {
    studentId: string;
    studentFeedingFeeId: string;
    amount: number;
    paymentDate: string;
    academicYear: string;
    term: string;
    daysApplied: number;
    paymentMethod?: string;
    notes?: string;
  }): Observable<string> {
    return from(
      this.call<string>('feeding_pub_record_payment', {
        p_student: p.studentId,
        p_sff: p.studentFeedingFeeId,
        p_amount: p.amount,
        p_date: p.paymentDate,
        p_year: p.academicYear,
        p_term: p.term,
        p_days: p.daysApplied,
        p_method: p.paymentMethod || 'Cash',
        p_notes: p.notes || null,
      }),
    );
  }

  updatePayment(
    paymentId: string,
    changes: { amount_paid: number; days_covered: number; payment_method?: string; notes?: string },
  ): Observable<void> {
    return from(
      this.call<void>('feeding_pub_update_payment', {
        p_payment: paymentId,
        p_amount: changes.amount_paid,
        p_days: changes.days_covered,
        p_method: changes.payment_method || null,
        p_notes: changes.notes || null,
      }),
    );
  }

  deletePayment(paymentId: string): Observable<void> {
    return from(this.call<void>('feeding_pub_delete_payment', { p_payment: paymentId }));
  }

  recordExpense(e: {
    year: string;
    term: string;
    amount: number;
    date: string;
    title: string;
    description?: string;
    enteredBy: string;
  }): Promise<string> {
    return this.call<string>('feeding_pub_record_expense', {
      p_year: e.year,
      p_term: e.term,
      p_amount: e.amount,
      p_date: e.date,
      p_title: e.title,
      p_description: e.description || null,
      p_entered_by: e.enteredBy,
    });
  }
}
