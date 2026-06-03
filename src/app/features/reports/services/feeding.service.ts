import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

// ── Types ─────────────────────────────────────────────────────────

export interface FeedingFeeStructure {
  id: string;
  church_id: string;
  class_id: string | null;
  academic_year: string;
  term: string;
  fee_name: string;
  daily_amount: number;
  total_days: number;
  total_amount: number; // generated: daily_amount × total_days
  is_active: boolean;
  created_at: string;
  updated_at: string;
  amount_due?: any;
  class?: { id: string; name: string; tier: string | null } | null;
}

export interface StudentFeedingFee {
  id: string;
  church_id: string;
  student_id: string;
  feeding_fee_structure_id: string | null;
  academic_year: string;
  term: string;
  daily_amount: number;
  total_days: number;
  amount_due: number;
  amount_paid: number;
  status: 'unpaid' | 'partial' | 'paid';
  created_at: string;
  updated_at: string;
  student?: any;
  feeding_fee_structure?: FeedingFeeStructure | null;
}

export interface FeedingPayment {
  id: string;
  church_id: string;
  student_id: string;
  student_feeding_fee_id: string | null;
  payment_date: string;
  academic_year: string;
  term: string;
  amount_paid: number;
  days_covered: number;
  payment_method: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  student?: any;
}

export interface FeedingAttendance {
  id: string;
  church_id: string;
  student_id: string;
  attendance_date: string;
  academic_year: string;
  term: string;
  is_present: boolean;
  recorded_by: string | null;
  created_at: string;
}

// Legacy type kept for backward compat
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

export interface DayEntry {
  date: string;
  isPresent: boolean | null;
  amountApplied: number;
  isFutureDay: boolean;
  runningBalance: number;
  paymentId?: string | null;
  notes?: string | null;
  label: string;
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

// ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FeedingService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId(): string {
    return this.authService.getChurchId() || '';
  }

  // ══════════════════════════════════════════════════════════════
  // FEE STRUCTURES  (mirrors SchoolService.getFeeStructures)
  // ══════════════════════════════════════════════════════════════

  getFeedingFeeStructures(
    academicYear: string,
    term: string,
    classId?: string,
  ): Observable<FeedingFeeStructure[]> {
    let query = this.supabase.client
      .from('feeding_fee_structures')
      .select('*, class:school_classes(id, name, tier)')
      .eq('church_id', this.churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .eq('is_active', true)
      .order('created_at');

    if (classId) query = query.eq('class_id', classId);

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeedingFeeStructure[];
      }),
    );
  }

  createFeedingFeeStructure(
    data: Partial<FeedingFeeStructure>,
  ): Observable<FeedingFeeStructure> {
    return from(
      this.supabase.client
        .from('feeding_fee_structures')
        .insert({ ...data, church_id: this.churchId })
        .select('*, class:school_classes(id, name, tier)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeedingFeeStructure;
      }),
    );
  }

  updateFeedingFeeStructure(
    id: string,
    data: Partial<FeedingFeeStructure>,
  ): Observable<FeedingFeeStructure> {
    return from(
      this.supabase.client
        .from('feeding_fee_structures')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select('*, class:school_classes(id, name, tier)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeedingFeeStructure;
      }),
    );
  }

  deleteFeedingFeeStructure(id: string): Observable<void> {
    return from(
      this.supabase.client.rpc('delete_feeding_fee_structure_safe', {
        p_fee_structure_id: id,
        p_church_id: this.churchId,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ASSIGN FEE STRUCTURE → STUDENTS  (mirrors assign_fees_to_class)
  // ══════════════════════════════════════════════════════════════

  assignFeedingFeeToClass(
    feedingFeeStructureId: string,
    classId: string,
    academicYear: string,
    term: string,
  ): Observable<number> {
    return from(
      this.supabase.client.rpc('assign_feeding_fee_to_class', {
        p_church_id: this.churchId,
        p_feeding_fee_structure_id: feedingFeeStructureId,
        p_class_id: classId,
        p_academic_year: academicYear,
        p_term: term,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as number;
      }),
    );
  }

  assignFeedingFeeToStudent(
    studentId: string,
    feedingFeeStructureId: string,
    academicYear: string,
    term: string,
    customAmount?: number,
  ): Observable<string> {
    return from(
      this.supabase.client.rpc('assign_feeding_fee_to_student', {
        p_church_id: this.churchId,
        p_student_id: studentId,
        p_feeding_fee_structure_id: feedingFeeStructureId,
        p_academic_year: academicYear,
        p_term: term,
        p_custom_amount: customAmount ?? null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as string;
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // STUDENT FEEDING FEES  (mirrors getStudentFees / getOutstandingFees)
  // ══════════════════════════════════════════════════════════════

  getStudentFeedingFees(
    studentId: string,
    academicYear: string,
    term: string,
  ): Observable<StudentFeedingFee[]> {
    return from(
      this.supabase.client
        .from('student_feeding_fees')
        .select(
          '*, feeding_fee_structure:feeding_fee_structures(fee_name, daily_amount, total_days, total_amount)',
        )
        .eq('church_id', this.churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('created_at'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as StudentFeedingFee[];
      }),
    );
  }

  getAllStudentFeedingFees(
    academicYear: string,
    term: string,
  ): Observable<StudentFeedingFee[]> {
    return from(
      this.supabase.client
        .from('student_feeding_fees')
        .select(
          '*, student:students(id, first_name, last_name, student_number, class:school_classes(id, name, tier)), feeding_fee_structure:feeding_fee_structures(fee_name, daily_amount, total_days)',
        )
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('created_at'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as StudentFeedingFee[];
      }),
    );
  }

  getOutstandingStudentFeedingFees(
    academicYear: string,
    term: string,
    classId?: string,
  ): Observable<StudentFeedingFee[]> {
    let query = this.supabase.client
      .from('student_feeding_fees')
      .select(
        '*, student:students(id, first_name, last_name, student_number, class_id, class:school_classes(id, name, tier)), feeding_fee_structure:feeding_fee_structures(fee_name, daily_amount, total_days)',
      )
      .eq('church_id', this.churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .in('status', ['unpaid', 'partial'])
      .order('created_at');

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        let result = data as StudentFeedingFee[];
        if (classId) {
          result = result.filter((f: any) => f.student?.class_id === classId);
        }
        return result;
      }),
    );
  }

  getStudentsAssignedToFeedingFeeStructure(
    feedingFeeStructureId: string,
    academicYear: string,
    term: string,
  ): Observable<any[]> {
    return from(
      this.supabase.client
        .from('student_feeding_fees')
        .select(
          'id, student_id, amount_due, amount_paid, status, student:students(first_name, last_name, student_number, class:school_classes(name))',
        )
        .eq('church_id', this.churchId)
        .eq('feeding_fee_structure_id', feedingFeeStructureId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('created_at'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((row: any) => ({
          studentFeedingFeeId: row.id,
          studentId: row.student_id,
          studentName:
            `${row.student?.first_name || ''} ${row.student?.last_name || ''}`.trim(),
          studentNumber: row.student?.student_number || '',
          className: row.student?.class?.name || '—',
          amountDue: Number(row.amount_due),
          amountPaid: Number(row.amount_paid),
          status: row.status,
          hasPayments: Number(row.amount_paid) > 0,
        }));
      }),
    );
  }

  updateStudentFeedingFeeAmount(
    studentFeedingFeeId: string,
    newAmount: number,
  ): Observable<void> {
    return from(
      this._updateStudentFeedingFeeAmount(studentFeedingFeeId, newAmount),
    );
  }

  private async _updateStudentFeedingFeeAmount(
    studentFeedingFeeId: string,
    newAmount: number,
  ): Promise<void> {
    const { count, error: countError } = await this.supabase.client
      .from('feeding_payments')
      .select('id', { count: 'exact', head: true })
      .eq('student_feeding_fee_id', studentFeedingFeeId)
      .eq('church_id', this.churchId);

    if (countError) throw new Error(countError.message);
    if ((count || 0) > 0) {
      throw new Error(
        'Cannot change the amount after payments have been recorded.',
      );
    }

    const { error } = await this.supabase.client
      .from('student_feeding_fees')
      .update({ amount_due: newAmount, updated_at: new Date().toISOString() })
      .eq('id', studentFeedingFeeId)
      .eq('church_id', this.churchId);

    if (error) throw new Error(error.message);
  }

  unassignStudentFeedingFee(studentFeedingFeeId: string): Observable<void> {
    return from(this._unassignStudentFeedingFee(studentFeedingFeeId));
  }

  private async _unassignStudentFeedingFee(
    studentFeedingFeeId: string,
  ): Promise<void> {
    const { count, error: countError } = await this.supabase.client
      .from('feeding_payments')
      .select('id', { count: 'exact', head: true })
      .eq('student_feeding_fee_id', studentFeedingFeeId)
      .eq('church_id', this.churchId);

    if (countError) throw new Error(countError.message);
    if ((count || 0) > 0) {
      throw new Error(
        'This fee has payments recorded. Remove payments first before unassigning.',
      );
    }

    const { error } = await this.supabase.client
      .from('student_feeding_fees')
      .delete()
      .eq('id', studentFeedingFeeId)
      .eq('church_id', this.churchId);

    if (error) throw new Error(error.message);
  }

  // ══════════════════════════════════════════════════════════════
  // PAYMENTS  (mirrors record_fee_payment / getPayments)
  // ══════════════════════════════════════════════════════════════

  recordFeedingPayment(payment: {
    studentId: string;
    studentFeedingFeeId: string;
    amount: number;
    paymentDate: string;
    academicYear: string;
    term: string;
    daysApplied: number;
    paymentMethod?: string;
    notes?: string;
    churchId?: string; // ← already in the interface
  }): Observable<string> {
    const churchId = payment.churchId || this.churchId; // ← prefer the passed-in one

    return from(
      this.supabase.client.rpc('record_feeding_payment', {
        p_church_id: churchId, // ← was: this.churchId
        p_student_id: payment.studentId,
        p_student_feeding_fee_id: payment.studentFeedingFeeId,
        p_amount: payment.amount,
        p_payment_date: payment.paymentDate,
        p_academic_year: payment.academicYear,
        p_term: payment.term,
        p_days_covered: payment.daysApplied,
        p_payment_method: payment.paymentMethod || 'Cash',
        p_notes: payment.notes || null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as string;
      }),
    );
  }

  updateFeedingPayment(
    paymentId: string,
    changes: {
      amount_paid: number;
      days_covered: number;
      payment_date?: string;
      payment_method?: string;
      notes?: string;
    },
  ): Observable<void> {
    return from(this._updateFeedingPayment(paymentId, changes));
  }

  private async _updateFeedingPayment(
    paymentId: string,
    changes: any,
  ): Promise<void> {
    // Get old payment to know how much to adjust
    const { data: old, error: fetchErr } = await this.supabase.client
      .from('feeding_payments')
      .select('amount_paid, student_feeding_fee_id')
      .eq('id', paymentId)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const diff = changes.amount_paid - Number(old.amount_paid);

    // Update the payment row
    const { error: updateErr } = await this.supabase.client
      .from('feeding_payments')
      .update(changes)
      .eq('id', paymentId)
      .eq('church_id', this.churchId);

    if (updateErr) throw new Error(updateErr.message);

    // Adjust student_feeding_fee running total
    if (old.student_feeding_fee_id && diff !== 0) {
      await this.supabase.client.rpc('recalculate_student_feeding_fee', {
        p_student_feeding_fee_id: old.student_feeding_fee_id,
      });
    }
  }

  deleteFeedingPayment(paymentId: string): Observable<void> {
    return from(
      this.supabase.client.rpc('delete_feeding_payment', {
        p_payment_id: paymentId,
        p_church_id: this.churchId,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  getPaymentsForStudent(
    studentId: string,
    academicYear: string,
    term: string,
  ): Observable<FeedingPayment[]> {
    return from(
      this.supabase.client
        .from('feeding_payments')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('payment_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeedingPayment[];
      }),
    );
  }

  getPaymentsForFeedingFee(
    studentFeedingFeeId: string,
  ): Observable<FeedingPayment[]> {
    return from(
      this.supabase.client
        .from('feeding_payments')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('student_feeding_fee_id', studentFeedingFeeId)
        .order('payment_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeedingPayment[];
      }),
    );
  }

  getAllPayments(
    academicYear: string,
    term: string,
    date?: string,
  ): Observable<FeedingPayment[]> {
    let query = this.supabase.client
      .from('feeding_payments')
      .select(
        '*, student:students(id, first_name, last_name, student_number, class:school_classes(id, name, tier))',
      )
      .eq('church_id', this.churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .order('created_at', { ascending: false });

    if (date) query = query.eq('payment_date', date);

    return from(query).pipe(map(({ data }) => data || []));
  }

  // ══════════════════════════════════════════════════════════════
  // ATTENDANCE  (unchanged — keep existing logic)
  // ══════════════════════════════════════════════════════════════

  getAttendanceForDate(
    date: string,
    academicYear: string,
    term: string,
  ): Observable<FeedingAttendance[]> {
    return from(
      this.supabase.client
        .from('feeding_attendance')
        .select(
          `
  id,
  church_id,
  student_id,
  attendance_date,
  academic_year,
  term,
  is_present,
  recorded_by,
  created_at
`,
        )
        .eq('church_id', this.churchId)
        .eq('attendance_date', date)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ).pipe(map(({ data }) => data || []));
  }

  async getAttendancePromise(
    churchId: string,
    date: string,
    academicYear: string,
    term: string,
  ): Promise<FeedingAttendance[]> {
    const { data, error } = await this.supabase.client
      .from('feeding_attendance')
      .select(
        `
  id,
  church_id,
  student_id,
  attendance_date,
  academic_year,
  term,
  is_present,
  recorded_by,
  created_at
`,
      )
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
      .upsert(records, { onConflict: 'church_id,student_id,attendance_date' });

    if (error) throw new Error(error.message);
  }

  // ══════════════════════════════════════════════════════════════
  // STATISTICS  (mirrors getSchoolStatistics)
  // ══════════════════════════════════════════════════════════════

  getFeedingStatistics(academicYear: string, term: string): Observable<any> {
    return from(
      Promise.all([
        this.supabase.client
          .from('student_feeding_fees')
          .select('amount_due, amount_paid, status')
          .eq('church_id', this.churchId)
          .eq('academic_year', academicYear)
          .eq('term', term),
        this.supabase.client
          .from('feeding_fee_structures')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', this.churchId)
          .eq('academic_year', academicYear)
          .eq('term', term)
          .eq('is_active', true),
        this.supabase.client
          .from('feeding_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', this.churchId)
          .eq('academic_year', academicYear)
          .eq('term', term)
          .eq('is_present', true),
      ]),
    ).pipe(
      map(([feesRes, structuresRes, attendanceRes]) => {
        const fees = feesRes.data || [];
        const totalDue = fees.reduce(
          (s: number, f: any) => s + Number(f.amount_due),
          0,
        );
        const totalPaid = fees.reduce(
          (s: number, f: any) => s + Number(f.amount_paid),
          0,
        );

        return {
          total_due: totalDue,
          total_paid: totalPaid,
          total_outstanding: totalDue - totalPaid,
          paid_count: fees.filter((f: any) => f.status === 'paid').length,
          partial_count: fees.filter((f: any) => f.status === 'partial').length,
          unpaid_count: fees.filter((f: any) => f.status === 'unpaid').length,
          total_students_enrolled: fees.length,
          total_structures: structuresRes.count || 0,
          total_present_days: attendanceRes.count || 0,
          collection_rate:
            totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
        };
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DAILY SUMMARY  (for recording page top bar)
  // ══════════════════════════════════════════════════════════════

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

    return { present, absent, totalCollected };
  }

  // ══════════════════════════════════════════════════════════════
  // STUDENT TERM DETAIL  (for timeline modal)
  // ══════════════════════════════════════════════════════════════

  async getStudentTermDetail(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
  ): Promise<{
    student: any;
    studentFeedingFees: StudentFeedingFee[];
    payments: FeedingPayment[];
    attendance: FeedingAttendance[];
    totalDue: number;
    totalPaid: number;
    totalBalance: number;
    presentDays: number;
    overallStatus: string;
  }> {
    const [studentRes, sffRes, paymentsRes, attendanceRes] = await Promise.all([
      this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, student_number, class:school_classes(name, tier)',
        )
        .eq('id', studentId)
        .single(),
      this.supabase.client
        .from('student_feeding_fees')
        .select(
          '*, feeding_fee_structure:feeding_fee_structures(fee_name, daily_amount, total_days)',
        )
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term),
      this.supabase.client
        .from('feeding_payments')
        .select('*')
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('payment_date', { ascending: true }),
      this.supabase.client
        .from('feeding_attendance')
        .select(
          `
  id,
  church_id,
  student_id,
  attendance_date,
  academic_year,
  term,
  is_present,
  recorded_by,
  created_at
`,
        )
        .eq('church_id', churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('attendance_date', { ascending: true }),
    ]);

    const sff = sffRes.data || [];
    const payments = paymentsRes.data || [];
    const attendance = attendanceRes.data || [];

    const totalDue = sff.reduce(
      (s: number, f: any) => s + Number(f.amount_due),
      0,
    );
    const totalPaid = sff.reduce(
      (s: number, f: any) => s + Number(f.amount_paid),
      0,
    );
    const presentDays = attendance.filter((a: any) => a.is_present).length;

    let overallStatus = 'paid';
    for (const f of sff) {
      if (f.status === 'unpaid') {
        overallStatus = 'unpaid';
        break;
      }
      if (f.status === 'partial') overallStatus = 'partial';
    }
    if (sff.length === 0) overallStatus = 'unpaid';

    return {
      student: studentRes.data,
      studentFeedingFees: sff,
      payments,
      attendance,
      totalDue,
      totalPaid,
      totalBalance: totalDue - totalPaid,
      presentDays,
      overallStatus,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CLASSES  (unchanged helper)
  // ══════════════════════════════════════════════════════════════

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

  getStudentsByClass(churchId: string, classId?: string): Observable<any[]> {
    let query = this.supabase.client
      .from('students')
      .select(
        'id, first_name, last_name, middle_name, student_number, class_id, class:school_classes(id, name, tier)',
      )
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('first_name');
    if (classId) query = query.eq('class_id', classId);
    return from(query).pipe(map(({ data }) => data || []));
  }

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

  // ══════════════════════════════════════════════════════════════
  // RECORDING WINDOWS  (unchanged)
  // ══════════════════════════════════════════════════════════════

  getActiveRecordingWindow(churchId: string): Observable<any | null> {
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

  async getActiveRecordingWindowPromise(churchId: string): Promise<any | null> {
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

  // Kept for legacy compatibility - used by old public recording page
  async resolveRatesForStudents(
    churchId: string,
    academicYear: string,
    term: string,
    students: Array<{
      id: string;
      class?: { id: string; tier: string | null } | null;
    }>,
  ): Promise<Record<string, number>> {
    const { data: sffs } = await this.supabase.client
      .from('student_feeding_fees')
      .select('student_id, daily_amount')
      .eq('church_id', churchId)
      .eq('academic_year', academicYear)
      .eq('term', term)
      .in(
        'student_id',
        students.map((s) => s.id),
      );

    const result: Record<string, number> = {};
    for (const s of students) {
      const match = (sffs || []).find((f: any) => f.student_id === s.id);
      result[s.id] = match ? Number(match.daily_amount) : 0;
    }
    return result;
  }

  // Kept for public recording page
  async getStudentFeedingSummaryPromise(
    churchId: string,
    studentId: string,
    academicYear: string,
    term: string,
    dailyRate: number,
  ): Promise<any> {
    const [sffRes, attendanceRes] = await Promise.all([
      this.supabase.client
        .from('student_feeding_fees')
        .select('amount_due, amount_paid, status')
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

    const sff = sffRes.data || [];
    const totalDue = sff.reduce(
      (s: number, f: any) => s + Number(f.amount_due),
      0,
    );
    const totalPaid = sff.reduce(
      (s: number, f: any) => s + Number(f.amount_paid),
      0,
    );
    const presentDays = attendanceRes.data?.length || 0;
    const totalOwed = presentDays * dailyRate;
    const creditBalance = Math.max(0, totalPaid - totalOwed);
    const prepaidDaysRemaining =
      dailyRate > 0 ? Math.floor(creditBalance / dailyRate) : 0;

    return {
      totalPaid,
      totalDue,
      balance: Math.max(0, totalDue - totalPaid),
      presentDays,
      totalOwed,
      hasPayment: sff.some((f: any) => Number(f.amount_paid) > 0),
      totalDaysCovered: 0,
      prepaidDaysRemaining,
      creditBalance,
    };
  }

  // Kept for public recording page payment recording
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
    return from(this._updateFeedingPayment(paymentId, changes));
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
}
