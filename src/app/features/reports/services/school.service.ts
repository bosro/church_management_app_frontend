import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  SchoolClass,
  Student,
  FeeStructure,
  StudentFee,
  FeePayment,
  Subject,
  GradingScale,
  Exam,
  ExamResult,
  DEFAULT_GRADING_SCALE,
  StudentReportCard,
  FeeStatement,
} from '../../../models/school.model';
import { ImportResult } from '../../../models/member.model';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class SchoolService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId(): string {
    return this.authService.getChurchId() || '';
  }

  // ─── CLASSES ────────────────────────────────────────────

  getClasses(academicYear?: string): Observable<SchoolClass[]> {
    let query = this.supabase.client
      .from('school_classes')
      .select('*')
      .eq('church_id', this.churchId)
      .eq('is_active', true)
      .order('level_order');

    if (academicYear) query = query.eq('academic_year', academicYear);

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SchoolClass[];
      }),
    );
  }

  createClass(data: Partial<SchoolClass>): Observable<SchoolClass> {
    return from(
      this.supabase.client
        .from('school_classes')
        .insert({ ...data, church_id: this.churchId })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SchoolClass;
      }),
    );
  }

  updateClass(id: string, data: Partial<SchoolClass>): Observable<SchoolClass> {
    return from(
      this.supabase.client
        .from('school_classes')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SchoolClass;
      }),
    );
  }

  deleteClass(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('school_classes')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // ─── STUDENTS ────────────────────────────────────────────

  getStudents(
    filters?: {
      classId?: string;
      academicYear?: string;
      search?: string;
      isActive?: boolean;
      sortBy?: 'name_asc' | 'name_desc' | 'created_at_desc';
    },
    page = 1,
    pageSize = 20,
  ): Observable<{ data: Student[]; count: number }> {
    let query = this.supabase.client
      .from('students')
      .select('*, class:school_classes(*)', { count: 'exact' })
      .eq('church_id', this.churchId);

    if (filters?.classId) query = query.eq('class_id', filters.classId);
    if (filters?.isActive !== undefined)
      query = query.eq('is_active', filters.isActive);
    if (filters?.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,student_number.ilike.%${filters.search}%`,
      );
    }

    const from_range = (page - 1) * pageSize;

    // Apply sort
    if (filters?.sortBy === 'name_asc') {
      query = query.order('first_name', { ascending: true });
    } else if (filters?.sortBy === 'name_desc') {
      query = query.order('first_name', { ascending: false });
    } else {
      // default: last_name ascending (original behaviour)
      query = query.order('last_name');
    }

    query = query.range(from_range, from_range + pageSize - 1);

    return from(query).pipe(
      map(({ data, error, count }) => {
        if (error) throw error;
        return { data: data as Student[], count: count || 0 };
      }),
    );
  }

  getStudentById(id: string): Observable<Student> {
    return from(
      this.supabase.client
        .from('students')
        .select('*, class:school_classes(*)')
        .eq('id', id)
        .eq('church_id', this.churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Student;
      }),
    );
  }

  getStudentFeesForMultiple(
    studentIds: string[],
    academicYear: string,
    term: string,
  ): Observable<any[]> {
    return from(
      this.supabase.client
        .from('student_fees')
        .select('*, fee_structure:fee_structures(fee_name, amount)')
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .in('student_id', studentIds),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
    );
  }

  createStudent(data: Partial<Student>): Observable<Student> {
    return from(
      this.supabase.client.rpc('generate_student_number', {
        p_church_id: this.churchId,
      }),
    ).pipe(
      map(({ data: studentNumber, error }) => {
        if (error) throw error;
        return studentNumber as string;
      }),
      switchMap((studentNumber: string) =>
        this.createStudentWithNumber(data, studentNumber),
      ),
    );
  }

  createStudentWithNumber(
    data: Partial<Student>,
    studentNumber: string,
  ): Observable<Student> {
    return from(
      this.supabase.client
        .from('students')
        .insert({
          ...data,
          church_id: this.churchId,
          student_number: studentNumber,
        })
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Student;
      }),
    );
  }

  updateStudent(id: string, data: Partial<Student>): Observable<Student> {
    return from(
      this.supabase.client
        .from('students')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Student;
      }),
    );
  }

  deleteStudent(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('students')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // ─── BULK DELETE STUDENTS ─────────────────────────────────────────────────

  bulkDeleteStudents(
    ids: string[],
  ): Observable<{ deleted: number; errors: string[] }> {
    return from(this._bulkDeleteStudents(ids));
  }

  private async _bulkDeleteStudents(
    ids: string[],
  ): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    try {
      await this._cascadeDeleteStudents(ids);
      deleted = ids.length;
    } catch {
      for (const id of ids) {
        try {
          await this._cascadeDeleteStudents([id]);
          deleted++;
        } catch (e: any) {
          errors.push(`${id}: ${e.message}`);
        }
      }
    }

    return { deleted, errors };
  }

  private async _cascadeDeleteStudents(ids: string[]): Promise<void> {
    const sb = this.supabase.client;

    const { error: feesError } = await sb
      .from('student_fees')
      .delete()
      .in('student_id', ids);
    if (feesError)
      console.warn('Could not clean student_fees:', feesError.message);

    const { error: paymentsError } = await sb
      .from('fee_payments')
      .delete()
      .in('student_id', ids);
    if (paymentsError)
      console.warn('Could not clean fee_payments:', paymentsError.message);

    const { error: resultsError } = await sb
      .from('exam_results')
      .delete()
      .in('student_id', ids);
    if (resultsError)
      console.warn('Could not clean exam_results:', resultsError.message);

    const { error } = await sb
      .from('students')
      .delete()
      .in('id', ids)
      .eq('church_id', this.churchId);

    if (error) throw new Error(error.message);
  }

  // ─── STUDENT DUPLICATE DETECTION ──────────────────────────────────────────

  /**
   * Fetches ALL active students across all pages for deduplication.
   * Uses a paginated loop identical to the members service approach.
   */
  private async _fetchAllStudentsForDedup(): Promise<
    {
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      parent_phone: string | null;
      created_at: string;
    }[]
  > {
    const pageSize = 1000;
    let page = 0;
    const all: any[] = [];

    while (true) {
      const from_idx = page * pageSize;
      const to_idx = from_idx + pageSize - 1;

      const { data, error } = await this.supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, date_of_birth, parent_phone, created_at',
        )
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .range(from_idx, to_idx);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

    return all;
  }

  /**
   * Builds duplicate groups using three strategies (matching members service):
   *   A) first_name + last_name + date_of_birth  (most reliable)
   *   B) first_name + last_name + parent_phone    (fallback)
   *   C) exact full name only, non-trivial names  (last resort)
   */
  private _buildStudentDuplicateGroups(
    students: {
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      parent_phone: string | null;
      created_at: string;
    }[],
  ): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const s of students) {
      const firstName = (s.first_name || '').toLowerCase().trim();
      const lastName = (s.last_name || '').toLowerCase().trim();

      let key: string | null = null;

      if (s.date_of_birth) {
        key = `dob|${firstName}|${lastName}|${s.date_of_birth}`;
      } else if (s.parent_phone) {
        key = `phone|${firstName}|${lastName}|${s.parent_phone.trim()}`;
      } else if (firstName.length > 2 && lastName.length > 2) {
        key = `name|${firstName}|${lastName}`;
      }

      if (!key) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s.id);
    }

    return groups;
  }

  getStudentDuplicateStats(): Observable<{ groups: number; toDelete: number }> {
    return from(this._fetchStudentDuplicateStats());
  }

  deleteStudentDuplicates(): Observable<{ deleted: number; groups: number }> {
    return from(this._deleteStudentDuplicates());
  }

  private async _fetchStudentDuplicateStats(): Promise<{
    groups: number;
    toDelete: number;
  }> {
    const students = await this._fetchAllStudentsForDedup();
    const groups = this._buildStudentDuplicateGroups(students);

    let groupCount = 0;
    let toDelete = 0;

    for (const [, ids] of groups) {
      if (ids.length > 1) {
        groupCount++;
        toDelete += ids.length - 1;
      }
    }

    return { groups: groupCount, toDelete };
  }

  private async _deleteStudentDuplicates(): Promise<{
    deleted: number;
    groups: number;
  }> {
    const students = await this._fetchAllStudentsForDedup();
    const groups = this._buildStudentDuplicateGroups(students);

    const toDelete: string[] = [];
    let groupCount = 0;

    for (const [, ids] of groups) {
      if (ids.length > 1) {
        groupCount++;
        toDelete.push(...ids.slice(1)); // keep ids[0] (oldest), delete rest
      }
    }

    if (toDelete.length === 0) return { deleted: 0, groups: 0 };

    let totalDeleted = 0;
    const batchSize = 50;

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      await this._cascadeDeleteStudents(batch);
      totalDeleted += batch.length;
    }

    return { deleted: totalDeleted, groups: groupCount };
  }

  // ─── STUDENT COUNTS BY CLASS ───────────────────────────────────────────────

  getStudentCountsByClass(
    academicYear?: string,
  ): Observable<{ [classId: string]: number }> {
    return from(this._getStudentCountsByClass(academicYear));
  }

  private async _getStudentCountsByClass(
    academicYear?: string,
  ): Promise<{ [classId: string]: number }> {
    let query = this.supabase.client
      .from('students')
      .select('class_id')
      .eq('church_id', this.churchId)
      .eq('is_active', true)
      .not('class_id', 'is', null);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const counts: { [classId: string]: number } = {};
    (data || []).forEach((row: any) => {
      if (row.class_id) {
        counts[row.class_id] = (counts[row.class_id] || 0) + 1;
      }
    });

    return counts;
  }

  // ─── FEE STRUCTURES ──────────────────────────────────────

  getFeeStructures(
    classId: string,
    academicYear: string,
    term: string,
  ): Observable<FeeStructure[]> {
    return from(
      this.supabase.client
        .from('fee_structures')
        .select('*, class:school_classes(*)')
        .eq('church_id', this.churchId)
        .eq('class_id', classId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('fee_name'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeeStructure[];
      }),
    );
  }

  getAllFeeStructures(
    academicYear: string,
    term: string,
  ): Observable<FeeStructure[]> {
    return from(
      this.supabase.client
        .from('fee_structures')
        .select('*, class:school_classes(*)')
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('class_id'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeeStructure[];
      }),
    );
  }

  createFeeStructure(data: Partial<FeeStructure>): Observable<FeeStructure> {
    return from(
      this.supabase.client
        .from('fee_structures')
        .insert({
          ...data,
          church_id: this.churchId,
          // Convert empty string to null for UUID fields
          class_id: data.class_id || null,
        })
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeeStructure;
      }),
    );
  }

  updateFeeStructure(
    id: string,
    data: Partial<FeeStructure>,
  ): Observable<FeeStructure> {
    return from(
      this.supabase.client
        .from('fee_structures')
        .update({
          ...data,
          class_id: data.class_id || null, // ← add this
        })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeeStructure;
      }),
    );
  }

  deleteFeeStructure(id: string): Observable<void> {
    return from(
      this.supabase.client.rpc('delete_fee_structure_safe', {
        p_fee_structure_id: id,
        p_church_id: this.churchId,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  assignFeesToAllClasses(academicYear: string, term: string): Observable<void> {
    return from(
      this.supabase.client.rpc('assign_fees_to_all_classes', {
        p_church_id: this.churchId,
        p_academic_year: academicYear,
        p_term: term,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  assignFeesToClass(
    classId: string,
    academicYear: string,
    term: string,
  ): Observable<void> {
    return from(
      this.supabase.client.rpc('assign_fees_to_class', {
        p_church_id: this.churchId,
        p_class_id: classId,
        p_academic_year: academicYear,
        p_term: term,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  assignSingleFeeToAllStudents(
    feeStructureId: string,
    academicYear: string,
    term: string,
  ): Observable<void> {
    return from(
      this.supabase.client.rpc('assign_single_fee_to_all_students', {
        p_church_id: this.churchId,
        p_fee_structure_id: feeStructureId,
        p_academic_year: academicYear,
        p_term: term,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // ─── STUDENT FEES ─────────────────────────────────────────

  getStudentFees(
    studentId: string,
    academicYear: string,
    term: string,
  ): Observable<StudentFee[]> {
    return from(
      this.supabase.client
        .from('student_fees')
        .select('*, fee_structure:fee_structures(fee_name, amount)')
        .eq('church_id', this.churchId)
        .eq('student_id', studentId)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as any[]).map((f) => ({
          ...f,
          fee_name: f.fee_structure?.fee_name || 'Unknown Fee',
        })) as StudentFee[];
      }),
    );
  }

  getClassFeesSummary(
    classId: string,
    academicYear: string,
    term: string,
  ): Observable<any[]> {
    return from(
      this.supabase.client
        .from('student_fees')
        .select(
          '*, student:students(*, class:school_classes(*)), fee_structure:fee_structures(fee_name, amount)',
        )
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((f: any) => ({
          ...f,
          fee_name: f.fee_structure?.fee_name || 'Unknown Fee',
        }));
      }),
    );
  }

  getOutstandingFees(academicYear: string, term: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('student_fees')
        .select(
          '*, student:students(*, class:school_classes(*)), fee_structure:fee_structures(fee_name, amount)',
        )
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .in('status', ['unpaid', 'partial'])
        .order('student_id'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((f: any) => ({
          ...f,
          fee_name: f.fee_structure?.fee_name || 'Unknown Fee',
        }));
      }),
    );
  }

  // ─── FEE PAYMENTS ─────────────────────────────────────────

  getPayments(
    filters?: {
      studentId?: string;
      academicYear?: string;
      term?: string;
    },
    page = 1,
    pageSize = 50,
  ): Observable<{ data: FeePayment[]; count: number }> {
    let query = this.supabase.client
      .from('fee_payments')
      .select(
        '*, student:students(*, class:school_classes(*)), student_fee:student_fees(*, fee_structure:fee_structures(fee_name))',
        { count: 'exact' },
      )
      .eq('church_id', this.churchId);

    if (filters?.studentId) query = query.eq('student_id', filters.studentId);
    if (filters?.academicYear)
      query = query.eq('academic_year', filters.academicYear);
    if (filters?.term) query = query.eq('term', filters.term);

    const from_range = (page - 1) * pageSize;
    query = query
      .range(from_range, from_range + pageSize - 1)
      .order('created_at', { ascending: false });

    return from(query).pipe(
      map(({ data, error, count }) => {
        if (error) throw error;
        const grouped = this.groupPaymentsByReceipt(data || []);
        return { data: grouped, count: count || 0 };
      }),
    );
  }

  getPaymentByReceiptNumber(receiptNumber: string): Observable<FeePayment> {
    return from(
      this.supabase.client
        .from('fee_payments')
        .select(
          '*, student:students(*, class:school_classes(*)), student_fee:student_fees(*, fee_structure:fee_structures(fee_name))',
        )
        .eq('church_id', this.churchId)
        .eq('receipt_number', receiptNumber),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const grouped = this.groupPaymentsByReceipt(data || []);
        if (grouped.length === 0) throw new Error('Receipt not found');
        return grouped[0];
      }),
    );
  }

  private groupPaymentsByReceipt(rows: any[]): FeePayment[] {
    const map: { [receipt: string]: FeePayment } = {};

    rows.forEach((row) => {
      const rn = row.receipt_number;
      if (!map[rn]) {
        map[rn] = {
          id: row.id,
          church_id: row.church_id,
          student_id: row.student_id,
          student: row.student, // set initially
          receipt_number: rn,
          amount: 0,
          payment_method: row.payment_method,
          payment_date: row.payment_date,
          academic_year: row.academic_year,
          term: row.term,
          received_by: row.received_by,
          received_by_name: row.received_by_name,
          notes: row.notes,
          fee_items: [],
          created_at: row.created_at,
        };
      }

      // ✅ FIX 3: Always prefer the row that has full student data populated
      // (Supabase join might return null student on some rows if fee_id is null)
      if (!map[rn].student && row.student) {
        map[rn].student = row.student;
      }
      // ✅ Also ensure student_id is never overwritten with a different student's id
      // (guard against cross-contamination between receipts)
      if (map[rn].student_id !== row.student_id) {
        // This row belongs to a different student — skip (data integrity issue)
        console.warn(
          `Receipt ${rn} has rows from multiple students — skipping row`,
        );
        return;
      }

      map[rn].amount += Number(row.amount);
      map[rn].fee_items.push({
        fee_name: row.student_fee?.fee_structure?.fee_name || 'Fee',
        amount: Number(row.amount),
        amount_due: Number(row.student_fee?.amount_due || 0),
        amount_paid_total: Number(row.student_fee?.amount_paid || 0),
        is_arrears: !row.student_fee_id,
      });
    });

    return Object.values(map);
  }

  assignFeeToStudent(
    studentId: string,
    feeStructureId: string,
    academicYear: string,
    term: string,
  ): Observable<string> {
    return from(
      this.supabase.client.rpc('assign_fee_to_student', {
        p_church_id: this.churchId,
        p_student_id: studentId,
        p_fee_structure_id: feeStructureId,
        p_academic_year: academicYear,
        p_term: term,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as string;
      }),
    );
  }

  getAllFeeStructuresForAssignment(
    academicYear: string,
    term: string,
  ): Observable<FeeStructure[]> {
    return from(
      this.supabase.client
        .from('fee_structures')
        .select('*, class:school_classes(*)')
        .eq('church_id', this.churchId)
        .eq('academic_year', academicYear)
        .eq('term', term)
        .order('fee_name'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as FeeStructure[];
      }),
    );
  }

  recordPayment(paymentData: {
    studentId: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    academicYear: string;
    term: string;
    feeItems: { feeId: string; feeName: string; amount: number }[];
    notes?: string;
  }): Observable<FeePayment> {
    return from(
      this.supabase.client.rpc('generate_receipt_number', {
        p_church_id: this.churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as string;
      }),
      switchMap((receiptNumber: string) =>
        this.recordPaymentWithReceipt(paymentData, receiptNumber),
      ),
    );
  }

  recordPaymentWithReceipt(
    paymentData: {
      studentId: string;
      amount: number;
      paymentMethod: string;
      paymentDate: string;
      academicYear: string;
      term: string;
      feeItems: {
        feeId: string | null;
        feeName: string;
        amount: number;
        is_arrears?: boolean;
      }[];
      notes?: string;
      receivedBy?: string;
    },
    receiptNumber: string,
  ): Observable<any> {
    return from(
      this.supabase.client.rpc('record_fee_payment', {
        p_church_id: this.churchId,
        p_student_id: paymentData.studentId,
        p_receipt_number: receiptNumber,
        p_amount: paymentData.amount,
        p_payment_method: paymentData.paymentMethod,
        p_payment_date: paymentData.paymentDate,
        p_academic_year: paymentData.academicYear,
        p_term: paymentData.term,
        p_fee_items: paymentData.feeItems,
        p_notes: paymentData.notes || null,
        p_received_by_name: paymentData.receivedBy || null, // ← text name now
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  getFeePaymentHistory(feeId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('fee_payments')
        .select(
          'id, amount, payment_date, payment_method, receipt_number, received_by_name, notes, created_at',
        )
        .eq('church_id', this.churchId)
        .eq('student_fee_id', feeId)
        .order('payment_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data || [];
      }),
    );
  }

  // ─── SUBJECTS ─────────────────────────────────────────────

  getSubjects(classId?: string): Observable<Subject[]> {
    let query = this.supabase.client
      .from('school_subjects')
      .select('*, class:school_classes(*)')
      .eq('church_id', this.churchId)
      .eq('is_active', true)
      .order('name');

    if (classId) query = query.eq('class_id', classId);

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Subject[];
      }),
    );
  }

  createSubject(data: Partial<Subject>): Observable<Subject> {
    return from(
      this.supabase.client
        .from('school_subjects')
        .insert({ ...data, church_id: this.churchId })
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Subject;
      }),
    );
  }

  updateSubject(id: string, data: Partial<Subject>): Observable<Subject> {
    return from(
      this.supabase.client
        .from('school_subjects')
        .update(data)
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Subject;
      }),
    );
  }

  deleteSubject(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('school_subjects')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // ─── GRADING SCALE ────────────────────────────────────────

  getGradingScale(): Observable<GradingScale[]> {
    return from(
      this.supabase.client
        .from('grading_scales')
        .select('*')
        .eq('church_id', this.churchId)
        .order('min_score', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GradingScale[];
      }),
    );
  }

  initializeGradingScale(): Observable<void> {
    const scales = DEFAULT_GRADING_SCALE.map((s) => ({
      ...s,
      church_id: this.churchId,
    }));

    return from(
      this.supabase.client.from('grading_scales').insert(scales),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  updateGradingScale(scales: GradingScale[]): Observable<void> {
    return from(
      this.supabase.client
        .from('grading_scales')
        .upsert(scales.map((s) => ({ ...s, church_id: this.churchId }))),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // ─── EXAMS ────────────────────────────────────────────────

  getExams(filters?: {
    classId?: string;
    academicYear?: string;
    term?: string;
  }): Observable<Exam[]> {
    let query = this.supabase.client
      .from('exams')
      .select('*, class:school_classes(*)')
      .eq('church_id', this.churchId)
      .order('created_at', { ascending: false });

    if (filters?.classId) query = query.eq('class_id', filters.classId);
    if (filters?.academicYear)
      query = query.eq('academic_year', filters.academicYear);
    if (filters?.term) query = query.eq('term', filters.term);

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Exam[];
      }),
    );
  }

  createExam(data: Partial<Exam>): Observable<Exam> {
    return from(
      this.supabase.client
        .from('exams')
        .insert({ ...data, church_id: this.churchId })
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Exam;
      }),
    );
  }

  updateExam(id: string, data: Partial<Exam>): Observable<Exam> {
    return from(
      this.supabase.client
        .from('exams')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select('*, class:school_classes(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Exam;
      }),
    );
  }

  // ─── EXAM RESULTS ─────────────────────────────────────────

  getExamResults(examId: string): Observable<ExamResult[]> {
    return from(
      this.supabase.client
        .from('exam_results')
        .select(
          '*, student:students(*, class:school_classes(*)), subject:school_subjects(*)',
        )
        .eq('exam_id', examId)
        .eq('church_id', this.churchId)
        .order('student_id'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ExamResult[];
      }),
    );
  }

  upsertExamResults(results: Partial<ExamResult>[]): Observable<void> {
    const payload = results.map((r) => ({
      ...r,
      church_id: this.churchId,
    }));

    return from(this.supabase.client.from('exam_results').upsert(payload)).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  getStudentReportCard(
    studentId: string,
    examId: string,
  ): Observable<StudentReportCard> {
    return from(
      Promise.all([
        this.supabase.client
          .from('students')
          .select('*, class:school_classes(*)')
          .eq('id', studentId)
          .single(),
        this.supabase.client
          .from('exams')
          .select('*, class:school_classes(*)')
          .eq('id', examId)
          .single(),
        this.supabase.client
          .from('exam_results')
          .select('*, subject:school_subjects(*)')
          .eq('student_id', studentId)
          .eq('exam_id', examId),
        this.supabase.client.rpc('get_student_exam_position', {
          p_student_id: studentId,
          p_exam_id: examId,
        }),
        this.supabase.client
          .from('exam_results')
          .select('student_id')
          .eq('exam_id', examId),
      ]),
    ).pipe(
      map(([studentRes, examRes, resultsRes, positionRes, allRes]) => {
        if (studentRes.error) throw studentRes.error;
        if (examRes.error) throw examRes.error;
        if (resultsRes.error) throw resultsRes.error;

        const student = studentRes.data as Student;
        const exam = examRes.data as Exam;
        const results = resultsRes.data as ExamResult[];
        const position = positionRes.data as number;

        const uniqueStudents = new Set(
          (allRes.data || []).map((r: any) => r.student_id),
        );

        const totalMarks = results.reduce(
          (sum, r) => sum + (r.marks_obtained || 0),
          0,
        );
        const average = results.length > 0 ? totalMarks / results.length : 0;

        return {
          student,
          class: student.class!,
          exam,
          results,
          total_marks: totalMarks,
          average,
          position,
          total_students: uniqueStudents.size,
          academic_year: exam.academic_year,
          term: exam.term,
        } as StudentReportCard;
      }),
    );
  }

  // ─── STATISTICS ───────────────────────────────────────────

  getSchoolStatistics(academicYear: string, term: string): Observable<any> {
    return from(
      Promise.all([
        this.supabase.client
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', this.churchId)
          .eq('is_active', true),
        this.supabase.client
          .from('school_classes')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', this.churchId)
          .eq('is_active', true),
        this.supabase.client
          .from('student_fees')
          .select('amount_due, amount_paid, status')
          .eq('church_id', this.churchId)
          .eq('academic_year', academicYear)
          .eq('term', term),
        this.supabase.client
          .from('fee_payments')
          .select('amount')
          .eq('church_id', this.churchId)
          .eq('academic_year', academicYear)
          .eq('term', term),
      ]),
    ).pipe(
      map(([studentsRes, classesRes, feesRes, paymentsRes]) => {
        const fees = feesRes.data || [];
        const totalDue = fees.reduce(
          (s: number, f: any) => s + f.amount_due,
          0,
        );
        const totalPaid = fees.reduce(
          (s: number, f: any) => s + f.amount_paid,
          0,
        );

        return {
          total_students: studentsRes.count || 0,
          total_classes: classesRes.count || 0,
          total_fees_due: totalDue,
          total_fees_paid: totalPaid,
          total_outstanding: totalDue - totalPaid,
          paid_count: fees.filter((f: any) => f.status === 'paid').length,
          partial_count: fees.filter((f: any) => f.status === 'partial').length,
          unpaid_count: fees.filter((f: any) => f.status === 'unpaid').length,
        };
      }),
    );
  }

  // ─── HELPERS ──────────────────────────────────────────────

  getGradeFromScore(score: number, scale: GradingScale[]): string {
    const match = scale.find(
      (s) => score >= s.min_score && score <= s.max_score,
    );
    return match?.grade || '9';
  }

  getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  importStudentsFromFile(
    file: File,
    defaultClassId?: string,
  ): Observable<ImportResult> {
    return from(this.processStudentFileImport(file, defaultClassId));
  }

  private async processStudentFileImport(
    file: File,
    defaultClassId?: string,
  ): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      return this.processStudentExcelImport(file, defaultClassId);
    }
    return this.processStudentCSVImport(file, defaultClassId);
  }

  // ── Format detection ─────────────────────────────────────

  private detectExcelFormat(headers: string[]): 'jms_admission' | 'standard' {
    const upper = headers.map((h) => (h || '').toString().trim().toUpperCase());
    const jmsSignatures = [
      'STUDENT NAME',
      "FATHER'S NAME",
      "MOTHER'S NAME",
      'NEXT OF KING',
      'N.O.K CONTACT',
      'BLOOD GROUP',
    ];
    const hits = jmsSignatures.filter((sig) => upper.includes(sig)).length;
    return hits >= 2 ? 'jms_admission' : 'standard';
  }

  // ── Name parsing ──────────────────────────────────────────

  private parseStudentName(fullName: string): {
    first_name: string;
    last_name: string;
    middle_name: string;
  } {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
      return { first_name: '', last_name: '', middle_name: '' };
    if (parts.length === 1)
      return { first_name: parts[0], last_name: parts[0], middle_name: '' };
    if (parts.length === 2)
      return { first_name: parts[0], last_name: parts[1], middle_name: '' };
    return {
      first_name: parts[0],
      middle_name: parts.slice(1, -1).join(' '),
      last_name: parts[parts.length - 1],
    };
  }

  // ── Gender normalisation ──────────────────────────────────

  private normalizeGender(raw: string): string | null {
    const val = (raw || '').trim().toLowerCase();
    if (['male', 'm', 'boy', 'b'].includes(val)) return 'male';
    if (['female', 'f', 'girl', 'g'].includes(val)) return 'female';
    return val || null;
  }

  // ── Date normalisation ────────────────────────────────────

  private normalizeDateOfBirth(raw: any): string | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const str = raw.toString().trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD/MM/YYYY  or  DD-MM-YYYY  or  DD.MM.YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // MM/DD/YY(YY) — try to detect by checking day > 12
    const mdy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (mdy) {
      const [, m, d, y] = mdy;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Excel serial number (e.g. 44927)
    if (/^\d{5}$/.test(str)) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + parseInt(str, 10) * 86_400_000);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }

    // Native Date parse as last resort
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];

    return null;
  }

  // ── Column header aliases (comprehensive — matches members service) ─────────

  private readonly STUDENT_HEADER_ALIASES: Record<string, string> = {
    // First name
    'first name': 'first_name',
    first_name: 'first_name',
    firstname: 'first_name',
    'given name': 'first_name',
    given_name: 'first_name',
    forename: 'first_name',
    // Middle name
    'middle name': 'middle_name',
    middle_name: 'middle_name',
    middlename: 'middle_name',
    // Last name
    'last name': 'last_name',
    last_name: 'last_name',
    lastname: 'last_name',
    surname: 'last_name',
    'family name': 'last_name',
    family_name: 'last_name',
    // Full name (will be split)
    'full name': 'full_name',
    full_name: 'full_name',
    fullname: 'full_name',
    name: 'full_name',
    'student name': 'full_name',
    student_name: 'full_name',
    // DOB
    'date of birth': 'date_of_birth',
    date_of_birth: 'date_of_birth',
    dob: 'date_of_birth',
    dateofbirth: 'date_of_birth',
    birthday: 'date_of_birth',
    'birth date': 'date_of_birth',
    birth_date: 'date_of_birth',
    birthdate: 'date_of_birth',
    // Gender
    gender: 'gender',
    sex: 'gender',
    // Class
    class: 'class',
    'class name': 'class',
    class_name: 'class',
    classname: 'class',
    grade: 'class',
    level: 'class',
    form: 'class',
    // Parent / guardian
    'parent name': 'parent_name',
    parent_name: 'parent_name',
    parentname: 'parent_name',
    guardian: 'parent_name',
    'guardian name': 'parent_name',
    guardian_name: 'parent_name',
    "father's name": 'parent_name',
    fathers_name: 'parent_name',
    father: 'parent_name',
    "mother's name": 'parent_name',
    mothers_name: 'parent_name',
    mother: 'parent_name',
    'next of kin': 'parent_name',
    next_of_kin: 'parent_name',
    'nok name': 'parent_name',
    nok: 'parent_name',
    // Phone
    'parent phone': 'parent_phone',
    parent_phone: 'parent_phone',
    parentphone: 'parent_phone',
    phone: 'parent_phone',
    'phone number': 'parent_phone',
    phone_number: 'parent_phone',
    mobile: 'parent_phone',
    'mobile number': 'parent_phone',
    contact: 'parent_phone',
    'guardian phone': 'parent_phone',
    guardian_phone: 'parent_phone',
    'n.o.k contact': 'parent_phone',
    'nok contact': 'parent_phone',
    nok_contact: 'parent_phone',
    'father phone': 'parent_phone',
    'mother phone': 'parent_phone',
    // Email
    'parent email': 'parent_email',
    parent_email: 'parent_email',
    email: 'parent_email',
    'email address': 'parent_email',
    'guardian email': 'parent_email',
    guardian_email: 'parent_email',
    // Address
    address: 'address',
    'home address': 'address',
    home_address: 'address',
    location: 'address',
    // Student number (allow override)
    'student number': 'student_number',
    student_number: 'student_number',
    'admission number': 'student_number',
    admission_number: 'student_number',
    'student id': 'student_number',
    student_id: 'student_number',
  };

  // ── JMS Admission Form row → internal row ─────────────────

  private mapJmsRow(rawRow: Record<string, any>): Record<string, string> {
    const r: Record<string, string> = {};
    Object.entries(rawRow).forEach(([k, v]) => {
      r[k.trim().toUpperCase()] = String(v ?? '').trim();
    });

    const nameParsed = this.parseStudentName(r['STUDENT NAME'] || '');

    const parentName =
      r['NEXT OF KING'] ||
      r['NEXT OF KIN'] ||
      r["FATHER'S NAME"] ||
      r["MOTHER'S NAME"] ||
      '';

    const parentPhone =
      r['N.O.K CONTACT'] ||
      r['NOK CONTACT'] ||
      r['CONTACT'] ||
      r['PHONE'] ||
      '';

    return {
      first_name: nameParsed.first_name,
      middle_name: nameParsed.middle_name,
      last_name: nameParsed.last_name,
      date_of_birth: r['BIRTH DATE'] || r['DATE OF BIRTH'] || r['DOB'] || '',
      gender: r['GENDER'] || r['SEX'] || '',
      class: r['CLASS'] || r['CLASS NAME'] || r['GRADE'] || '',
      parent_name: parentName,
      parent_phone: parentPhone,
      parent_email: r['E-MAIL'] || r['EMAIL'] || '',
      address: r['ADDRESS'] || r['HOME ADDRESS'] || '',
    };
  }

  // ── Normalise a raw row using header aliases ───────────────────────────────

  private normalizeRowKeys(
    rawRow: Record<string, any>,
  ): Record<string, string> {
    const row: Record<string, string> = {};
    Object.entries(rawRow).forEach(([key, val]) => {
      const lowerKey = key.trim().toLowerCase().replace(/\s+/g, ' ');
      const canonical =
        this.STUDENT_HEADER_ALIASES[lowerKey] || lowerKey.replace(/\s+/g, '_');
      // Only set first occurrence (don't overwrite earlier canonical mapping)
      if (!(canonical in row)) {
        row[canonical] = String(val ?? '').trim();
      }
    });
    return row;
  }

  // ── Pre-load existing students for duplicate detection ────────────────────

  private async _preloadExistingStudents(): Promise<{
    phones: Set<string>;
    nameDobs: Set<string>;
  }> {
    const pageSize = 1000;
    let page = 0;
    const phones = new Set<string>();
    const nameDobs = new Set<string>();

    while (true) {
      const from_idx = page * pageSize;
      const to_idx = from_idx + pageSize - 1;

      const { data, error } = await this.supabase.client
        .from('students')
        .select('first_name, last_name, date_of_birth, parent_phone')
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .range(from_idx, to_idx);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;

      for (const s of data) {
        if (s.parent_phone) phones.add(s.parent_phone.trim());
        if (s.date_of_birth) {
          nameDobs.add(
            `${(s.first_name || '').toLowerCase().trim()}|${(s.last_name || '').toLowerCase().trim()}|${s.date_of_birth}`,
          );
        }
      }

      if (data.length < pageSize) break;
      page++;
    }

    return { phones, nameDobs };
  }

  // ── Check a parsed row for duplicates ────────────────────────────────────

  private checkStudentDuplicate(
    row: Record<string, string>,
    existing: { phones: Set<string>; nameDobs: Set<string> },
    seenPhonesThisBatch: Set<string>,
    seenNameDobsThisBatch: Set<string>,
  ): void {
    const phone = row['parent_phone'];
    const dob = row['date_of_birth'];
    const firstName = (row['first_name'] || '').toLowerCase().trim();
    const lastName = (row['last_name'] || '').toLowerCase().trim();

    if (phone) {
      if (existing.phones.has(phone)) {
        throw new Error(
          `Student with phone "${phone}" already exists — skipped`,
        );
      }
      if (seenPhonesThisBatch.has(phone)) {
        throw new Error(
          `Phone "${phone}" appears more than once in this file — skipped`,
        );
      }
    }

    if (dob && firstName && lastName) {
      const key = `${firstName}|${lastName}|${dob}`;
      if (existing.nameDobs.has(key)) {
        throw new Error(
          `Student "${row['first_name']} ${row['last_name']}" (DOB: ${dob}) already exists — skipped`,
        );
      }
      if (seenNameDobsThisBatch.has(key)) {
        throw new Error(
          `"${row['first_name']} ${row['last_name']}" (DOB: ${dob}) appears more than once in this file — skipped`,
        );
      }
    }
  }

  private trackInserted(
    row: Record<string, string>,
    existing: { phones: Set<string>; nameDobs: Set<string> },
    seenPhonesThisBatch: Set<string>,
    seenNameDobsThisBatch: Set<string>,
  ): void {
    const phone = row['parent_phone'];
    const dob = row['date_of_birth'];
    const firstName = (row['first_name'] || '').toLowerCase().trim();
    const lastName = (row['last_name'] || '').toLowerCase().trim();

    if (phone) {
      existing.phones.add(phone);
      seenPhonesThisBatch.add(phone);
    }
    if (dob && firstName && lastName) {
      const key = `${firstName}|${lastName}|${dob}`;
      existing.nameDobs.add(key);
      seenNameDobsThisBatch.add(key);
    }
  }

  // ── Excel import ──────────────────────────────────────────

  private async processStudentExcelImport(
    file: File,
    defaultClassId?: string,
  ): Promise<ImportResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: true,
    });

    if (!rows.length) throw new Error('File is empty or has no data rows');

    const headers = Object.keys(rows[0]);
    const format = this.detectExcelFormat(headers);

    const { data: classes } = await this.supabase.client
      .from('school_classes')
      .select('id, name, academic_year')
      .eq('church_id', this.churchId)
      .eq('is_active', true);

    const existing = await this._preloadExistingStudents();
    const seenPhonesThisBatch = new Set<string>();
    const seenNameDobsThisBatch = new Set<string>();

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      try {
        let row: Record<string, string>;

        if (format === 'jms_admission') {
          row = this.mapJmsRow(rows[i]);
        } else {
          row = this.normalizeRowKeys(rows[i]);
        }

        // If a 'full_name' column exists (no separate first/last), split it
        if (row['full_name'] && !row['first_name']) {
          const parsed = this.parseStudentName(row['full_name']);
          row['first_name'] = parsed.first_name;
          row['middle_name'] = row['middle_name'] || parsed.middle_name;
          row['last_name'] = parsed.last_name;
        }

        // Normalise date and gender
        row['date_of_birth'] =
          this.normalizeDateOfBirth(row['date_of_birth']) || '';
        row['gender'] = this.normalizeGender(row['gender']) || '';

        // Skip entirely blank rows
        const hasData = Object.values(row).some((v) => v !== '');
        if (!hasData) continue;

        if (!row['first_name'] || !row['last_name']) {
          throw new Error(
            format === 'jms_admission'
              ? 'STUDENT NAME is missing or could not be split into first/last name'
              : 'First Name and Last Name are required (or provide a "Full Name" column)',
          );
        }

        // Duplicate detection
        this.checkStudentDuplicate(
          row,
          existing,
          seenPhonesThisBatch,
          seenNameDobsThisBatch,
        );

        // Class resolution
        let resolvedClassId: string | null = null;
        const classNameInRow =
          row['class'] || row['class_name'] || row['grade'] || '';

        if (classNameInRow) {
          resolvedClassId = this.resolveClassId(classNameInRow, classes || []);
          if (!resolvedClassId) {
            throw new Error(
              `Class "${classNameInRow}" not found. Check it matches exactly (e.g. "Primary 3", "JHS 1")`,
            );
          }
        } else if (defaultClassId) {
          resolvedClassId = defaultClassId;
        }

        await this.insertStudentRow(row, resolvedClassId);
        this.trackInserted(
          row,
          existing,
          seenPhonesThisBatch,
          seenNameDobsThisBatch,
        );
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ row: i + 2, error: err.message, data: '' });
      }
    }

    return results;
  }

  // ── CSV import ────────────────────────────────────────────

  private async processStudentCSVImport(
    file: File,
    defaultClassId?: string,
  ): Promise<ImportResult> {
    const text = await file.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (lines.length < 2) throw new Error('CSV file is empty or invalid');

    const { data: classes } = await this.supabase.client
      .from('school_classes')
      .select('id, name, academic_year')
      .eq('church_id', this.churchId)
      .eq('is_active', true);

    const existing = await this._preloadExistingStudents();
    const seenPhonesThisBatch = new Set<string>();
    const seenNameDobsThisBatch = new Set<string>();

    // Parse headers using aliases
    const rawHeaders = this.parseCSVLine(lines[0]);
    const headers = rawHeaders.map((h) => {
      const lowerKey = h.trim().toLowerCase().replace(/\s+/g, ' ');
      return (
        this.STUDENT_HEADER_ALIASES[lowerKey] ||
        lowerKey.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      );
    });

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          if (!(h in row)) {
            row[h] = values[idx]?.trim() || '';
          }
        });

        // Handle full_name column
        if (row['full_name'] && !row['first_name']) {
          const parsed = this.parseStudentName(row['full_name']);
          row['first_name'] = parsed.first_name;
          row['middle_name'] = row['middle_name'] || parsed.middle_name;
          row['last_name'] = parsed.last_name;
        }

        row['date_of_birth'] =
          this.normalizeDateOfBirth(row['date_of_birth']) || '';
        row['gender'] = this.normalizeGender(row['gender']) || '';

        // Skip blank rows
        const hasData = Object.values(row).some((v) => v !== '');
        if (!hasData) continue;

        if (!row['first_name'] || !row['last_name']) {
          throw new Error(
            'First Name and Last Name are required (or provide a "Full Name" column)',
          );
        }

        // Duplicate detection
        this.checkStudentDuplicate(
          row,
          existing,
          seenPhonesThisBatch,
          seenNameDobsThisBatch,
        );

        const classNameInRow =
          row['class'] || row['class_name'] || row['grade'] || '';
        let resolvedClassId: string | null = null;

        if (classNameInRow) {
          resolvedClassId = this.resolveClassId(classNameInRow, classes || []);
          if (!resolvedClassId) {
            throw new Error(`Class "${classNameInRow}" not found`);
          }
        } else if (defaultClassId) {
          resolvedClassId = defaultClassId;
        }

        await this.insertStudentRow(row, resolvedClassId);
        this.trackInserted(
          row,
          existing,
          seenPhonesThisBatch,
          seenNameDobsThisBatch,
        );
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ row: i + 1, error: err.message, data: lines[i] });
      }
    }

    return results;
  }

  // ── CSV line parser (handles quoted fields) ───────────────────────────────

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  // ── Helpers ───────────────────────────────────────────────

  private resolveClassId(className: string, classes: any[]): string | null {
    if (!className) return null;
    const needle = className.toLowerCase().trim();
    // Exact match first
    const exact = classes.find((c) => c.name.toLowerCase().trim() === needle);
    if (exact) return exact.id;
    // Partial match fallback (e.g. "P3" → "Primary 3")
    const partial = classes.find(
      (c) =>
        c.name.toLowerCase().trim().includes(needle) ||
        needle.includes(c.name.toLowerCase().trim()),
    );
    return partial?.id || null;
  }

  private async insertStudentRow(
    row: Record<string, string>,
    classId: string | null,
  ): Promise<void> {
    const { data: studentNumber, error: snError } =
      await this.supabase.client.rpc('generate_student_number', {
        p_church_id: this.churchId,
      });
    if (snError) throw new Error(snError.message);

    if (!row['first_name'] || !row['last_name']) {
      throw new Error('First name and last name are required');
    }

    const { error } = await this.supabase.client.from('students').insert({
      church_id: this.churchId,
      student_number: studentNumber,
      first_name: row['first_name'],
      middle_name: row['middle_name'] || null,
      last_name: row['last_name'],
      date_of_birth: row['date_of_birth'] || null,
      gender: row['gender'] || null,
      class_id: classId || null,
      parent_name: row['parent_name'] || null,
      parent_phone: row['parent_phone'] || null,
      parent_email: row['parent_email'] || null,
      address: row['address'] || null,
      is_active: true,
    });

    if (error) throw new Error(error.message);
  }
}


