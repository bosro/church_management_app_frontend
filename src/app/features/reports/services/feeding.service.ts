import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export type FeedingTier = 'creche_kg' | 'lower_primary' | 'upper_primary' | 'jhs_shs';

export const TIER_LABELS: Record<FeedingTier, string> = {
  creche_kg: 'Creche / Nursery / KG',
  lower_primary: 'Lower Primary (P1–P3)',
  upper_primary: 'Upper Primary (P4–P6)',
  jhs_shs: 'JHS / SHS',
};

export const ALL_TIERS: FeedingTier[] = [
  'creche_kg',
  'lower_primary',
  'upper_primary',
  'jhs_shs',
];

@Injectable({ providedIn: 'root' })
export class FeedingService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ── Rate resolution ───────────────────────────────────────
  // Priority: class-level override → tier-level → school-wide fallback → 0

  async resolveRateForClass(
    churchId: string,
    classId: string | null | undefined,
    classTier: string | null | undefined,
    academicYear: string,
    term: string,
  ): Promise<number> {
    // Build OR filter: try class override first, then tier, then null/null fallback
    const filters: string[] = [];
    if (classId) filters.push(`class_id.eq.${classId}`);
    if (classTier) filters.push(`and(tier.eq.${classTier},class_id.is.null)`);
    filters.push('and(tier.is.null,class_id.is.null)');

    const { data } = await this.supabase.client
      .from('feeding_fee_settings')
      .select('daily_amount, tier, class_id')
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .or(filters.join(','));

    if (!data || data.length === 0) return 0;

    // Pick the most specific match
    if (classId) {
      const classMatch = data.find((r: any) => r.class_id === classId);
      if (classMatch) return Number(classMatch.daily_amount);
    }
    if (classTier) {
      const tierMatch = data.find(
        (r: any) => r.tier === classTier && !r.class_id,
      );
      if (tierMatch) return Number(tierMatch.daily_amount);
    }
    const fallback = data.find((r: any) => !r.tier && !r.class_id);
    return fallback ? Number(fallback.daily_amount) : 0;
  }

  // ── All settings for admin panel ──────────────────────────

  getAllSettings(
    churchId: string,
    academicYear: string,
    term: string,
  ): Observable<any[]> {
    return from(
      this.supabase.client
        .from('feeding_fee_settings')
        .select('*, class:school_classes(id, name, tier)')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('created_at'),
    ).pipe(map(({ data }) => data || []));
  }

  // ── Save/upsert a single setting row ─────────────────────
  // Supabase JS client cannot use onConflict with partial indexes, so we
  // always do a manual check-then-insert-or-update for all three scopes.

  saveSetting(
    churchId: string,
    academicYear: string,
    term: string,
    dailyAmount: number,
    scope: 'school' | 'tier' | 'class',
    tier?: FeedingTier,
    classId?: string,
  ): Observable<any> {
    return from(
      this.upsertSettingManually(churchId, academicYear, term, dailyAmount, scope, tier, classId),
    );
  }

  private async upsertSettingManually(
    churchId: string,
    academicYear: string,
    term: string,
    dailyAmount: number,
    scope: 'school' | 'tier' | 'class',
    tier?: FeedingTier,
    classId?: string,
  ): Promise<any> {
    // Find existing row for this exact scope
    let existingQuery = this.supabase.client
      .from('feeding_fee_settings')
      .select('id')
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term);

    if (scope === 'class' && classId) {
      existingQuery = existingQuery.eq('class_id', classId);
    } else if (scope === 'tier' && tier) {
      existingQuery = existingQuery.eq('tier', tier).is('class_id', null);
    } else {
      existingQuery = existingQuery.is('tier', null).is('class_id', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      // UPDATE existing row
      const { data, error } = await this.supabase.client
        .from('feeding_fee_settings')
        .update({ daily_amount: dailyAmount, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    } else {
      // INSERT new row
      const { data, error } = await this.supabase.client
        .from('feeding_fee_settings')
        .insert({
          church_id: churchId,
          academic_year: academicYear,
          term,
          daily_amount: dailyAmount,
          tier: scope === 'tier' ? tier : null,
          class_id: scope === 'class' ? classId : null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
  }

  deleteSetting(settingId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('feeding_fee_settings')
        .delete()
        .eq('id', settingId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // ── Legacy single getSettings (kept for feeding-record page) ─

  getSettings(
    churchId: string,
    academicYear: string,
    term: string,
  ): Observable<any> {
    return from(
      this.supabase.client
        .from('feeding_fee_settings')
        .select('*')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .is('tier', null)
        .is('class_id', null)
        .maybeSingle(),
    ).pipe(map(({ data }) => data));
  }

  // ── Students ──────────────────────────────────────────────

  searchStudents(churchId: string, query: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name, tier)',
        )
        .eq('church_id', churchId)
        .eq('is_active', true)
        .or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,student_number.ilike.%${query}%`,
        )
        .order('first_name')
        .limit(15),
    ).pipe(map(({ data }) => data || []));
  }

  getStudentsByClass(churchId: string, classId?: string): Observable<any[]> {
    let query = this.supabase.client
      .from('students')
      .select(
        'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name, tier)',
      )
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('first_name');
    if (classId) query = query.eq('class_id', classId);
    return from(query).pipe(map(({ data }) => data || []));
  }

  getClasses(churchId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('school_classes')
        .select('id, name, tier')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('level_order'),
    ).pipe(map(({ data }) => data || []));
  }

  // ── Attendance ────────────────────────────────────────────

  getAttendance(
    churchId: string,
    date: string,
    academicYear: string,
    term: string,
  ): Observable<any[]> {
    return from(this.getAttendancePromise(churchId, date, academicYear, term));
  }

  async getAttendancePromise(
    churchId: string,
    date: string,
    academicYear: string,
    term: string,
  ): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from('feeding_attendance')
      .select('id, student_id, is_present')
      .eq('church_id', churchId)
      .eq('attendance_date', date)
      .eq('academic_year', academicYear)
      .eq('term', term);
    if (error) throw new Error(error.message);
    return data || [];
  }

  upsertAttendance(record: {
    church_id: string;
    student_id: string;
    attendance_date: string;
    academic_year: string;
    term: string;
    is_present: boolean;
    recorded_by?: string;
  }): Observable<any> {
    return from(
      this.supabase.client
        .from('feeding_attendance')
        .upsert(record, { onConflict: 'church_id,student_id,attendance_date' })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  // ── Payments ──────────────────────────────────────────────

  recordPayment(payment: {
    church_id: string;
    student_id: string;
    payment_date: string;
    academic_year: string;
    term: string;
    amount_paid: number;
    days_covered: number;
    notes?: string;
    recorded_by?: string;
  }): Observable<any> {
    return from(
      this.supabase.client
        .from('feeding_payments')
        .insert(payment)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  updatePayment(
    paymentId: string,
    changes: {
      amount_paid: number;
      days_covered: number;
      notes?: string;
      payment_date?: string;
    },
  ): Observable<any> {
    return from(this.updatePaymentPromise(paymentId, changes));
  }

  private async updatePaymentPromise(
    paymentId: string,
    changes: {
      amount_paid: number;
      days_covered: number;
      notes?: string;
      payment_date?: string;
    },
  ): Promise<any> {
    // Build update payload — only include updated_at if column exists
    // (safe to always include; Postgres will error only if column missing)
    const payload: any = { ...changes };
    try {
      payload.updated_at = new Date().toISOString();
    } catch (_) {}

    const { data, error } = await this.supabase.client
      .from('feeding_payments')
      .update(payload)
      .eq('id', paymentId)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Payment not found or could not be updated');
    return data[0];
  }

  deletePayment(paymentId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('feeding_payments')
        .delete()
        .eq('id', paymentId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  getPayments(
    churchId: string,
    academicYear: string,
    term: string,
    date?: string,
  ): Observable<any[]> {
    let query = this.supabase.client
      .from('feeding_payments')
      .select(
        '*, student:students(id, first_name, last_name, student_number, class:school_classes(id, name, tier))',
      )
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .order('created_at', { ascending: false });
    if (date) query = query.eq('payment_date', date);
    return from(query).pipe(map(({ data }) => data || []));
  }

  // ── Student feeding summary ───────────────────────────────
  // Returns per-student totals. dailyRate must be resolved by caller (class-aware).

  getStudentFeedingSummary(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
    dailyRate: number,
  ): Observable<{
    totalPaid: number;
    presentDays: number;
    totalOwed: number;
    balance: number;
    hasPayment: boolean;
    totalDaysCovered: number;
    prepaidDaysRemaining: number;
  }> {
    return from(
      this.getStudentFeedingSummaryPromise(
        churchId,
        studentId,
        academicYear,
        term,
        dailyRate,
      ),
    );
  }

  async getStudentFeedingSummaryPromise(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
    dailyRate: number,
  ): Promise<{
    totalPaid: number;
    presentDays: number;
    totalOwed: number;
    balance: number;
    hasPayment: boolean;
    totalDaysCovered: number;
    prepaidDaysRemaining: number;
  }> {
    const [paymentsRes, attendanceRes] = await Promise.all([
      this.supabase.client
        .from('feeding_payments')
        .select('amount_paid, days_covered')
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term),
      this.supabase.client
        .from('feeding_attendance')
        .select('id')
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .eq('is_present', true),
    ]);

    const totalPaid = (paymentsRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );
    // Total days covered by all payments (sum of days_covered field)
    const totalDaysCovered = (paymentsRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.days_covered || 0),
      0,
    );
    const presentDays = (attendanceRes.data || []).length;
    const totalOwed = presentDays * dailyRate;
    // Pre-paid days remaining = days already paid for minus days already attended
    const prepaidDaysRemaining = Math.max(0, totalDaysCovered - presentDays);
    return {
      totalPaid,
      presentDays,
      totalOwed,
      balance: Math.max(0, totalOwed - totalPaid),
      hasPayment: (paymentsRes.data || []).length > 0,
      totalDaysCovered,
      prepaidDaysRemaining,
    };
  }

  // ── Daily summary ─────────────────────────────────────────
  // For the admin view — uses class-aware rates per student

  getDailySummary(
    churchId: string,
    date: string,
    academicYear: string,
    term: string,
  ): Observable<any> {
    return from(
      this.getDailySummaryPromise(churchId, date, academicYear, term),
    );
  }

  async getDailySummaryPromise(
    churchId: string,
    date: string,
    academicYear: string,
    term: string,
  ): Promise<any> {
    const [attRes, payRes] = await Promise.all([
      this.supabase.client
        .from('feeding_attendance')
        .select('id, is_present, student_id')
        .eq('church_id', churchId)
        .eq('attendance_date', date)
        .eq('academic_year', academicYear)
        .eq('term', term),
      this.supabase.client
        .from('feeding_payments')
        .select('amount_paid')
        .eq('church_id', churchId)
        .eq('payment_date', date)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ]);

    const present = (attRes.data || []).filter((a: any) => a.is_present).length;
    const absent = (attRes.data || []).filter((a: any) => !a.is_present).length;
    const totalCollected = (payRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );

    // For the summary bar we use total collected vs simple present count
    // (exact expected requires per-student rate resolution, too expensive here)
    return {
      present,
      absent,
      totalCollected,
      // expectedTotal is shown as "—" unless caller enriches it
      expectedTotal: null,
      shortfall: null,
    };
  }

  // ── Bulk rate resolution for a list of students ───────────
  // Returns a map of studentId → dailyRate

  async resolveRatesForStudents(
    churchId: string,
    academicYear: string,
    term: string,
    students: Array<{ id: string; class?: { id: string; tier: string | null } | null }>,
  ): Promise<Record<string, number>> {
    // Fetch all settings for this church/year/term at once
    const { data: settings } = await this.supabase.client
      .from('feeding_fee_settings')
      .select('daily_amount, tier, class_id')
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term);

    const rows = settings || [];

    const resolve = (classId?: string, classTier?: string | null): number => {
      if (classId) {
        const match = rows.find((r: any) => r.class_id === classId);
        if (match) return Number(match.daily_amount);
      }
      if (classTier) {
        const match = rows.find((r: any) => r.tier === classTier && !r.class_id);
        if (match) return Number(match.daily_amount);
      }
      const fallback = rows.find((r: any) => !r.tier && !r.class_id);
      return fallback ? Number(fallback.daily_amount) : 0;
    };

    const result: Record<string, number> = {};
    for (const s of students) {
      result[s.id] = resolve(s.class?.id, s.class?.tier);
    }
    return result;
  }

  // ── Student term detail (for admin panel) ────────────────
  // Returns full payment + attendance history for a student in a term,
  // merged into a day-by-day timeline with running balance.

  async getStudentTermDetail(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
    dailyRate: number,
  ): Promise<{
    student: any;
    payments: any[];
    attendance: any[];
    timeline: DayEntry[];
    totalPaid: number;
    totalDaysCovered: number;
    presentDays: number;
    totalOwed: number;
    prepaidDaysRemaining: number;
    balance: number;
  }> {
    const [studentRes, paymentsRes, attendanceRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select('id, first_name, last_name, middle_name, student_number, class:school_classes(name, tier)')
        .eq('id', studentId)
        .single(),
      this.supabase.client
        .from('feeding_payments')
        .select('id, payment_date, amount_paid, days_covered, notes, created_at')
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('payment_date', { ascending: true }),
      this.supabase.client
        .from('feeding_attendance')
        .select('id, attendance_date, is_present')
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('attendance_date', { ascending: true }),
    ]);

    const payments = paymentsRes.data || [];
    const attendance = attendanceRes.data || [];

    // Build a map of date → payment and date → attendance
    const paymentMap: Record<string, any> = {};
    payments.forEach((p: any) => { paymentMap[p.payment_date] = p; });
    const attendanceMap: Record<string, any> = {};
    attendance.forEach((a: any) => { attendanceMap[a.attendance_date] = a; });

    // Collect all unique dates
    const allDates = Array.from(new Set([
      ...payments.map((p: any) => p.payment_date),
      ...attendance.map((a: any) => a.attendance_date),
    ])).sort();

    // Build timeline with running carry-forward balance
    const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount_paid), 0);
    const totalDaysCovered = payments.reduce((s: number, p: any) => s + Number(p.days_covered || 0), 0);
    const presentDays = attendance.filter((a: any) => a.is_present).length;
    const totalOwed = presentDays * dailyRate;
    const prepaidDaysRemaining = Math.max(0, totalDaysCovered - presentDays);

    // Running balance: starts at 0, adds payment, subtracts daily rate on present days
    let runningBalance = 0;
    const timeline: DayEntry[] = allDates.map((date) => {
      const payment = paymentMap[date];
      const att = attendanceMap[date];
      const amountPaid = payment ? Number(payment.amount_paid) : 0;
      const isPresent = att ? att.is_present : null;

      if (amountPaid > 0) runningBalance += amountPaid;
      if (isPresent && dailyRate > 0) runningBalance -= dailyRate;

      return {
        date,
        isPresent,
        amountPaid,
        daysCovered: payment ? Number(payment.days_covered) : 0,
        notes: payment?.notes || null,
        paymentId: payment?.id || null,
        runningBalance,
        coveredByAdvance: !payment && isPresent && runningBalance >= 0,
      };
    });

    return {
      student: studentRes.data,
      payments,
      attendance,
      timeline,
      totalPaid,
      totalDaysCovered,
      presentDays,
      totalOwed,
      prepaidDaysRemaining,
      balance: Math.max(0, totalOwed - totalPaid),
    };
  }
}

// ── Supporting types ──────────────────────────────────────
export interface DayEntry {
  date: string;
  isPresent: boolean | null;
  amountPaid: number;
  daysCovered: number;
  notes: string | null;
  paymentId: string | null;
  runningBalance: number;
  coveredByAdvance: boolean;
}
