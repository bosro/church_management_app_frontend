import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export type FeedingTier =
  | 'creche_kg'
  | 'lower_primary'
  | 'upper_primary'
  | 'jhs_shs';

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

export interface UnrecordedStudentRow {
  id: string;
  name: string;
  studentNumber: string;
  className: string;
  classTier: string | null;
  classId: string | null;
  dailyRate: number;
  totalPaid: number;
  presentDaysThisTerm: number;
  totalOwed: number;
  creditBalance: number;
}

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
      .or(filters.join(','))
      .order('created_at', { ascending: false }); // ← ADD THIS LINE

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
      this.upsertSettingManually(
        churchId,
        academicYear,
        term,
        dailyAmount,
        scope,
        tier,
        classId,
      ),
    );
  }

  async getUnrecordedStudentsForWeek(
    churchId: string,
    academicYear: string,
    term: string,
    weekDate: string,
    rateResolver: (classId?: string, classTier?: string) => number,
  ): Promise<{
    weekStart: string;
    weekEnd: string;
    students: UnrecordedStudentRow[];
  }> {
    const d = new Date(weekDate + 'T00:00:00');
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const weekStart = fmt(mon);
    const weekEnd = fmt(fri);

    const [studentsRes, attendanceRes, paymentsRes, termAttRes] =
      await Promise.all([
        // All active students
        this.supabase.client
          .from('students')
          .select(
            'id, first_name, last_name, student_number, class:school_classes(id, name, tier)',
          )
          .eq('church_id', churchId)
          .eq('is_active', true),

        // Students WITH any attendance record this week
        this.supabase.client
          .from('feeding_attendance')
          .select('student_id')
          .eq('church_id', churchId)
          .eq('academic_year', academicYear)
          .eq('term', term)
          .gte('attendance_date', weekStart)
          .lte('attendance_date', weekEnd),

        // All payments this term (for credit balance)
        this.supabase.client
          .from('feeding_payments')
          .select('student_id, amount_paid')
          .eq('church_id', churchId)
          .eq('academic_year', academicYear)
          .eq('term', term),

        // All present days this term (for total owed)
        this.supabase.client
          .from('feeding_attendance')
          .select('student_id')
          .eq('church_id', churchId)
          .eq('academic_year', academicYear)
          .eq('term', term)
          .eq('is_present', true),
      ]);

    const students: any[] = studentsRes.data || [];
    const recordedIds = new Set(
      (attendanceRes.data || []).map((a: any) => a.student_id),
    );

    // Build payment totals per student
    const paidMap: Record<string, number> = {};
    (paymentsRes.data || []).forEach((p: any) => {
      paidMap[p.student_id] =
        (paidMap[p.student_id] || 0) + Number(p.amount_paid);
    });

    // Build present days per student this term
    const presentMap: Record<string, number> = {};
    (termAttRes.data || []).forEach((a: any) => {
      presentMap[a.student_id] = (presentMap[a.student_id] || 0) + 1;
    });

    // Filter to students NOT recorded this week
    const unrecorded: UnrecordedStudentRow[] = [];
    for (const s of students) {
      if (recordedIds.has(s.id)) continue;

      const rate = rateResolver(s.class?.id, s.class?.tier);
      const totalPaid = paidMap[s.id] || 0;
      const presentDays = presentMap[s.id] || 0;
      const totalOwed = presentDays * rate;
      const creditBalance = Math.max(0, totalPaid - totalOwed);

      unrecorded.push({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`.trim(),
        studentNumber: s.student_number || '',
        className: s.class?.name || '—',
        classTier: s.class?.tier || null,
        classId: s.class?.id || null,
        dailyRate: rate,
        totalPaid,
        presentDaysThisTerm: presentDays,
        totalOwed,
        creditBalance,
      });
    }

    // Sort: students with credit first (they matter most), then by name
    unrecorded.sort((a, b) => {
      if (b.creditBalance !== a.creditBalance)
        return b.creditBalance - a.creditBalance;
      return a.name.localeCompare(b.name);
    });

    return { weekStart, weekEnd, students: unrecorded };
  }

  // Mark multiple days absent for a student (admin override)
  async markDaysAbsent(
    churchId: string,
    studentId: string,
    dates: string[],
    academicYear: string,
    term: string,
  ): Promise<void> {
    const records = dates.map((date) => ({
      church_id: churchId,
      student_id: studentId,
      attendance_date: date,
      academic_year: academicYear,
      term,
      is_present: false,
    }));

    const { error } = await this.supabase.client
      .from('feeding_attendance')
      .upsert(records, {
        onConflict: 'church_id,student_id,attendance_date',
      });

    if (error) throw new Error(error.message);
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

    // Use limit(1) + array instead of maybeSingle() to safely handle any duplicates
    const { data: existingRows } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1);

    const existing =
      existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing?.id) {
      const { data, error } = await this.supabase.client
        .from('feeding_fee_settings')
        .update({
          daily_amount: dailyAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    } else {
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
    const { data, error } = await this.supabase.client
      .from('feeding_payments')
      .update(changes) // pass changes directly, no updated_at
      .eq('id', paymentId)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0)
      throw new Error('Payment not found or could not be updated');
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
    creditBalance: number; // NEW: monetary credit remaining
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
    const totalDaysCovered = (paymentsRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.days_covered || 0),
      0,
    );
    const presentDays = (attendanceRes.data || []).length;
    const totalOwed = presentDays * dailyRate;

    // Monetary credit: how much paid vs how much owed so far
    const creditBalance = Math.max(0, totalPaid - totalOwed);
    // How many future days does the credit cover
    const prepaidDaysRemaining =
      dailyRate > 0 ? Math.floor(creditBalance / dailyRate) : 0;

    return {
      totalPaid,
      presentDays,
      totalOwed,
      balance: Math.max(0, totalOwed - totalPaid),
      hasPayment: (paymentsRes.data || []).length > 0,
      totalDaysCovered,
      prepaidDaysRemaining,
      creditBalance,
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
    students: Array<{
      id: string;
      class?: { id: string; tier: string | null } | null;
    }>,
  ): Promise<Record<string, number>> {
    // Fetch all settings for this church/year/term at once
    const { data: settings } = await this.supabase.client
      .from('feeding_fee_settings')
      .select('daily_amount, tier, class_id')
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .order('created_at', { ascending: false }); // ← ADD THIS LINE

    const rows = settings || [];

    const resolve = (classId?: string, classTier?: string | null): number => {
      if (classId) {
        const match = rows.find((r: any) => r.class_id === classId);
        if (match) return Number(match.daily_amount);
      }
      if (classTier) {
        const match = rows.find(
          (r: any) => r.tier === classTier && !r.class_id,
        );
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
    creditBalance: number;
    balance: number;
  }> {
    const [studentRes, paymentsRes, attendanceRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class:school_classes(name, tier)',
        )
        .eq('id', studentId)
        .single(),
      this.supabase.client
        .from('feeding_payments')
        .select(
          'id, payment_date, amount_paid, days_covered, notes, created_at',
        )
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

    const paymentMap: Record<string, any> = {};
    payments.forEach((p: any) => {
      paymentMap[p.payment_date] = p;
    });
    const attendanceMap: Record<string, any> = {};
    attendance.forEach((a: any) => {
      attendanceMap[a.attendance_date] = a;
    });

    const allDates = Array.from(
      new Set([
        ...payments.map((p: any) => p.payment_date),
        ...attendance.map((a: any) => a.attendance_date),
      ]),
    ).sort();

    const totalPaid = payments.reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );
    const totalDaysCovered = payments.reduce(
      (s: number, p: any) => s + Number(p.days_covered || 0),
      0,
    );
    const presentDays = attendance.filter((a: any) => a.is_present).length;
    const totalOwed = presentDays * dailyRate;
    const creditBalance = Math.max(0, totalPaid - totalOwed);
    const prepaidDaysRemaining =
      dailyRate > 0 ? Math.floor(creditBalance / dailyRate) : 0;

    // Running monetary balance (positive = credit/overpaid, negative = owes money)
    let runningBalance = 0;
    const timeline: DayEntry[] = allDates.map((date) => {
      const payment = paymentMap[date];
      const att = attendanceMap[date];
      const amountPaid = payment ? Number(payment.amount_paid) : 0;
      const isPresent = att ? att.is_present : null;

      if (amountPaid > 0) runningBalance += amountPaid;
      if (isPresent && dailyRate > 0) runningBalance -= dailyRate;

      // coveredByAdvance: present today, no payment today, but running balance >= 0 (credit covered it)
      const coveredByAdvance =
        !payment && isPresent === true && runningBalance >= 0;

      return {
        date,
        isPresent,
        amountPaid,
        daysCovered: payment ? Number(payment.days_covered) : 0,
        notes: payment?.notes || null,
        paymentId: payment?.id || null,
        runningBalance,
        coveredByAdvance,
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
      creditBalance,
      balance: Math.max(0, totalOwed - totalPaid),
    };
  }

  // ── Weekly summary ────────────────────────────────────────
  // Returns enrollment-expected, attendance-owed, and actually-collected
  // totals for the ISO week containing `weekDate`.

  async getWeeklySummaryPromise(
    churchId: string,
    academicYear: string,
    term: string,
    weekDate: string,
    rateResolver: (classId?: string, classTier?: string) => number,
  ): Promise<{
    weekStart: string;
    weekEnd: string;
    enrollmentExpected: number;
    attendanceOwed: number;
    collected: number;
    allocatedToWeek: number;
    carryForward: number;
    carryForwardAmount: number;
    shortfall: number;
    coveredCount: number; // ← add this
    owingCount: number; // ← add this
  }> {
    const d = new Date(weekDate + 'T00:00:00');
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const weekStart = fmt(mon);
    const weekEnd = fmt(fri);

    // School days in this week (Mon–Fri as date strings)
    const weekDays: string[] = [];
    for (let i = 0; i < 5; i++) {
      const dd = new Date(mon);
      dd.setDate(mon.getDate() + i);
      weekDays.push(fmt(dd));
    }

    const [studentsRes, attendanceRes, paymentsRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select('id, class:school_classes(id, tier)')
        .eq('church_id', churchId)
        .eq('is_active', true),

      this.supabase.client
        .from('feeding_attendance')
        .select('student_id, attendance_date, is_present')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .gte('attendance_date', weekStart)
        .lte('attendance_date', weekEnd),

      // Fetch ALL payments — we need ones paid before this week too,
      // because their days_covered may spill INTO this week
      this.supabase.client
        .from('feeding_payments')
        .select('student_id, payment_date, amount_paid, days_covered')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ]);

    const students: any[] = studentsRes.data || [];
    const attendance: any[] = attendanceRes.data || [];
    const allPayments: any[] = paymentsRes.data || [];

    // Build student → rate map
    const studentRateMap: Record<string, number> = {};
    for (const s of students) {
      studentRateMap[s.id] = rateResolver(s.class?.id, s.class?.tier);
    }

    // ── Enrollment expected ───────────────────────────────────
    const enrollmentExpected = students.reduce((sum, s) => {
      return sum + (studentRateMap[s.id] ?? 0) * 5;
    }, 0);

    // ── Attendance owed ───────────────────────────────────────
    const attendanceOwed = attendance
      .filter((a) => a.is_present)
      .reduce((sum, a) => sum + (studentRateMap[a.student_id] ?? 0), 0);

    // ── Cash collected THIS week (payment_date falls in week) ─
    const collected = allPayments
      .filter((p) => p.payment_date >= weekStart && p.payment_date <= weekEnd)
      .reduce((sum, p) => sum + Number(p.amount_paid), 0);

    // ── Allocated-to-week calculation ─────────────────────────
    // For each payment (regardless of when it was paid), we figure out
    // which school days it covers sequentially from payment_date forward,
    // then count how many of those days fall inside this week.
    //
    // Assumptions (matching how your app records payments):
    //   - days_covered counts consecutive school days (Mon–Fri) from payment_date
    //   - Weekends are skipped automatically
    //   - One payment covers one student

    const addSchoolDays = (from: string, count: number): string[] => {
      const days: string[] = [];
      const cur = new Date(from + 'T00:00:00');
      // Start from payment_date itself if it's a weekday, else next Monday
      while (days.length < count) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          days.push(fmt(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    };

    let allocatedToWeek = 0;
    let carryForwardDays = 0;
    let carryForwardAmount = 0;

    const weekDaySet = new Set(weekDays);

    for (const p of allPayments) {
      const rate = studentRateMap[p.student_id] ?? 0;
      const daysCovered = Number(p.days_covered) || 0;
      if (daysCovered === 0 || rate === 0) {
        // No days_covered recorded — fall back to crediting full amount
        // to the payment_date week only (old behaviour for legacy records)
        if (p.payment_date >= weekStart && p.payment_date <= weekEnd) {
          allocatedToWeek += Number(p.amount_paid);
        }
        continue;
      }

      const coveredDays = addSchoolDays(p.payment_date, daysCovered);
      const daysInThisWeek = coveredDays.filter((d) =>
        weekDaySet.has(d),
      ).length;
      const daysAfterThisWeek = coveredDays.filter((d) => d > weekEnd).length;

      allocatedToWeek += daysInThisWeek * rate;

      // Carry-forward: days paid (from this week's payments) that go beyond Friday
      if (p.payment_date >= weekStart && p.payment_date <= weekEnd) {
        carryForwardDays += daysAfterThisWeek;
        carryForwardAmount += daysAfterThisWeek * rate;
      }
    }

    // Quick per-student covered/owing counts (same logic, lightweight)
    const studentPresentDays: Record<string, number> = {};
    attendance
      .filter((a) => a.is_present)
      .forEach((a) => {
        studentPresentDays[a.student_id] =
          (studentPresentDays[a.student_id] || 0) + 1;
      });

    const studentAllocatedDays: Record<string, number> = {};
    for (const p of allPayments) {
      const rate = studentRateMap[p.student_id] ?? 0;
      const daysCovered = Number(p.days_covered) || 0;
      if (daysCovered === 0 || rate === 0) continue;
      const coveredDays = addSchoolDays(p.payment_date, daysCovered);
      const inWeek = coveredDays.filter((d) => weekDaySet.has(d)).length;
      studentAllocatedDays[p.student_id] =
        (studentAllocatedDays[p.student_id] || 0) + inWeek;
    }

    let coveredCount = 0;
    let owingCount = 0;
    for (const sid of Object.keys(studentPresentDays)) {
      const present = studentPresentDays[sid] ?? 0;
      const allocated = studentAllocatedDays[sid] ?? 0;
      if (present === 0) continue;
      if (allocated >= present) coveredCount++;
      else owingCount++;
    }

    return {
      weekStart,
      weekEnd,
      enrollmentExpected,
      attendanceOwed,
      collected,
      allocatedToWeek,
      carryForward: carryForwardDays,
      carryForwardAmount,
      shortfall: Math.max(0, attendanceOwed - allocatedToWeek),
      coveredCount,
      owingCount,
    };
  }

  // ── Per-student weekly status ─────────────────────────────
  // Returns two lists: students fully covered this week, and students with a shortfall.
  // Only includes students who attended at least one day this week.

  async getWeeklyStudentBreakdown(
    churchId: string,
    academicYear: string,
    term: string,
    weekDate: string,
    rateResolver: (classId?: string, classTier?: string) => number,
  ): Promise<{
    weekStart: string;
    weekEnd: string;
    covered: WeeklyStudentRow[];
    owing: WeeklyStudentRow[];
  }> {
    const d = new Date(weekDate + 'T00:00:00');
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const weekStart = fmt(mon);
    const weekEnd = fmt(fri);

    const weekDays: string[] = [];
    for (let i = 0; i < 5; i++) {
      const dd = new Date(mon);
      dd.setDate(mon.getDate() + i);
      weekDays.push(fmt(dd));
    }
    const weekDaySet = new Set(weekDays);

    const [studentsRes, attendanceRes, allPaymentsRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, student_number, class:school_classes(id, name, tier)',
        )
        .eq('church_id', churchId)
        .eq('is_active', true),

      this.supabase.client
        .from('feeding_attendance')
        .select('student_id, attendance_date, is_present')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .gte('attendance_date', weekStart)
        .lte('attendance_date', weekEnd),

      this.supabase.client
        .from('feeding_payments')
        .select('student_id, payment_date, amount_paid, days_covered')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ]);

    const students: any[] = studentsRes.data || [];
    const attendance: any[] = attendanceRes.data || [];
    const allPayments: any[] = allPaymentsRes.data || [];

    // Build student map
    const studentMap: Record<string, any> = {};
    students.forEach((s) => (studentMap[s.id] = s));

    // Rate map
    const rateMap: Record<string, number> = {};
    students.forEach((s) => {
      rateMap[s.id] = rateResolver(s.class?.id, s.class?.tier);
    });

    // Days present this week per student
    const presentDaysMap: Record<string, number> = {};
    attendance.forEach((a) => {
      if (a.is_present) {
        presentDaysMap[a.student_id] = (presentDaysMap[a.student_id] || 0) + 1;
      }
    });

    // Helper: school days covered by a payment sequentially from payment_date
    const addSchoolDays = (from: string, count: number): string[] => {
      const days: string[] = [];
      const cur = new Date(from + 'T00:00:00');
      while (days.length < count) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) days.push(fmt(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    };

    // Days allocated to THIS week per student
    const allocatedDaysMap: Record<string, number> = {};
    allPayments.forEach((p) => {
      const daysCovered = Number(p.days_covered) || 0;
      const rate = rateMap[p.student_id] ?? 0;
      if (daysCovered === 0 || rate === 0) return;
      const coveredDays = addSchoolDays(p.payment_date, daysCovered);
      const inWeek = coveredDays.filter((d) => weekDaySet.has(d)).length;
      allocatedDaysMap[p.student_id] =
        (allocatedDaysMap[p.student_id] || 0) + inWeek;
    });

    // Amount paid this week per student (cash received)
    const paidThisWeekMap: Record<string, number> = {};
    allPayments
      .filter((p) => p.payment_date >= weekStart && p.payment_date <= weekEnd)
      .forEach((p) => {
        paidThisWeekMap[p.student_id] =
          (paidThisWeekMap[p.student_id] || 0) + Number(p.amount_paid);
      });

    const covered: WeeklyStudentRow[] = [];
    const owing: WeeklyStudentRow[] = [];

    // Only process students who attended this week
    const attendingStudentIds = Object.keys(presentDaysMap);

    for (const sid of attendingStudentIds) {
      const student = studentMap[sid];
      if (!student) continue;
      const rate = rateMap[sid] ?? 0;
      const presentDays = presentDaysMap[sid] ?? 0;
      const allocatedDays = allocatedDaysMap[sid] ?? 0;
      const owedThisWeek = presentDays * rate;
      const allocatedAmount = allocatedDays * rate;
      const shortfall = Math.max(0, owedThisWeek - allocatedAmount);

      const row: WeeklyStudentRow = {
        id: sid,
        name: `${student.first_name} ${student.last_name}`.trim(),
        studentNumber: student.student_number || '',
        className: student.class?.name || '—',
        presentDays,
        owedThisWeek,
        allocatedAmount,
        shortfall,
        paidThisWeek: paidThisWeekMap[sid] ?? 0,
        dailyRate: rate,
      };

      if (shortfall === 0) {
        covered.push(row);
      } else {
        owing.push(row);
      }
    }

    // Sort owing by shortfall descending, covered by name
    owing.sort((a, b) => b.shortfall - a.shortfall);
    covered.sort((a, b) => a.name.localeCompare(b.name));

    return { weekStart, weekEnd, covered, owing };
  }

  getWeeklySummary(
    churchId: string,
    academicYear: string,
    term: string,
    weekDate: string,
    rateResolver: (classId?: string, classTier?: string) => number,
  ): Observable<{
    weekStart: string;
    weekEnd: string;
    enrollmentExpected: number;
    attendanceOwed: number;
    collected: number;
    shortfall: number;
    coveredCount: number; // ← add
    owingCount: number; // ← add
  }> {
    return from(
      this.getWeeklySummaryPromise(
        churchId,
        academicYear,
        term,
        weekDate,
        rateResolver,
      ),
    );
  }

  // ── Recording windows ─────────────────────────────────────

  getActiveRecordingWindow(churchId: string): Observable<{
    id: string;
    allow_from: string;
    allow_to: string;
    reason: string | null;
  } | null> {
    return from(
      this.supabase.client
        .from('feeding_recording_windows')
        .select('id, allow_from, allow_to, reason')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ).pipe(map(({ data }) => data || null));
  }

  async getActiveRecordingWindowPromise(churchId: string): Promise<{
    id: string;
    allow_from: string;
    allow_to: string;
    reason: string | null;
  } | null> {
    const { data } = await this.supabase.client
      .from('feeding_recording_windows')
      .select('id, allow_from, allow_to, reason')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  createRecordingWindow(
    churchId: string,
    allowFrom: string,
    allowTo: string,
    reason?: string,
  ): Observable<any> {
    return from(
      this.supabase.client
        .from('feeding_recording_windows')
        .insert({
          church_id: churchId,
          allow_from: allowFrom,
          allow_to: allowTo,
          reason: reason || null,
          is_active: true,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  deactivateRecordingWindow(windowId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('feeding_recording_windows')
        .update({ is_active: false })
        .eq('id', windowId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  getAllRecordingWindows(churchId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('feeding_recording_windows')
        .select('*')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(20),
    ).pipe(map(({ data }) => data || []));
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

export interface WeeklyStudentRow {
  id: string;
  name: string;
  studentNumber: string;
  className: string;
  presentDays: number;
  owedThisWeek: number;
  allocatedAmount: number;
  shortfall: number;
  paidThisWeek: number;
  dailyRate: number;
}
