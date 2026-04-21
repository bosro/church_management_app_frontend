import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({ providedIn: 'root' })
export class FeedingService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ── Settings ─────────────────────────────────────────────

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
        .maybeSingle(),
    ).pipe(map(({ data }) => data));
  }

  saveSettings(
    churchId: string,
    academicYear: string,
    term: string,
    dailyAmount: number,
  ): Observable<any> {
    return from(
      this.supabase.client
        .from('feeding_fee_settings')
        .upsert(
          {
            church_id: churchId,
            academic_year: academicYear,
            term,
            daily_amount: dailyAmount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'church_id,academic_year,term' },
        )
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  // ── Students ──────────────────────────────────────────────

  searchStudents(churchId: string, query: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class:school_classes(name)',
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
        'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name)',
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
        .select('id, name')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name'),
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

  getPayments(
    churchId: string,
    academicYear: string,
    term: string,
    date?: string,
  ): Observable<any[]> {
    let query = this.supabase.client
      .from('feeding_payments')
      .select(
        '*, student:students(id, first_name, last_name, student_number, class:school_classes(name))',
      )
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .order('created_at', { ascending: false });
    if (date) query = query.eq('payment_date', date);
    return from(query).pipe(map(({ data }) => data || []));
  }

  // ── Student feeding summary ───────────────────────────────
  // Single batched query instead of 3 separate ones to avoid race conditions.

  getStudentFeedingSummary(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
  ): Observable<{
    totalPaid: number;
    presentDays: number;
    totalOwed: number;
    balance: number;
  }> {
    return from(
      this.getStudentFeedingSummaryPromise(
        churchId,
        studentId,
        academicYear,
        term,
      ),
    );
  }

  async getStudentFeedingSummaryPromise(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
  ): Promise<{
    totalPaid: number;
    presentDays: number;
    totalOwed: number;
    balance: number;
  }> {
    const [paymentsRes, attendanceRes, settingsRes] = await Promise.all([
      this.supabase.client
        .from('feeding_payments')
        .select('amount_paid')
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
      this.supabase.client
        .from('feeding_fee_settings')
        .select('daily_amount')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .maybeSingle(),
    ]);

    const totalPaid = (paymentsRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );
    const presentDays = (attendanceRes.data || []).length;
    const dailyAmount = Number(settingsRes.data?.daily_amount || 0);
    const totalOwed = presentDays * dailyAmount;
    return {
      totalPaid,
      presentDays,
      totalOwed,
      balance: Math.max(0, totalOwed - totalPaid),
    };
  }

  // ── Daily summary ─────────────────────────────────────────

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
    const [attRes, payRes, settingsRes] = await Promise.all([
      this.supabase.client
        .from('feeding_attendance')
        .select('id, is_present')
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
      this.supabase.client
        .from('feeding_fee_settings')
        .select('daily_amount')
        .eq('church_id', churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .maybeSingle(),
    ]);

    const present = (attRes.data || []).filter((a: any) => a.is_present).length;
    const absent = (attRes.data || []).filter((a: any) => !a.is_present).length;
    const totalCollected = (payRes.data || []).reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );
    const dailyAmount = Number(settingsRes.data?.daily_amount || 0);
    const expectedTotal = present * dailyAmount;
    return {
      present,
      absent,
      totalCollected,
      expectedTotal,
      dailyAmount,
      shortfall: Math.max(0, expectedTotal - totalCollected),
    };
  }
}
