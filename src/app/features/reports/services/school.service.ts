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
    query = query
      .range(from_range, from_range + pageSize - 1)
      .order('last_name');

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
        .insert({ ...data, church_id: this.churchId })
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
        .update(data)
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
      this.supabase.client
        .from('fee_structures')
        .delete()
        .eq('id', id)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
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
        // Group by receipt_number to reconstruct FeePayment objects
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

  // Helper to group individual fee_payment rows into FeePayment objects
  private groupPaymentsByReceipt(rows: any[]): FeePayment[] {
    const map: { [receipt: string]: FeePayment } = {};
    rows.forEach((row) => {
      const rn = row.receipt_number;
      if (!map[rn]) {
        map[rn] = {
          id: row.id,
          church_id: row.church_id,
          student_id: row.student_id,
          student: row.student,
          receipt_number: rn,
          amount: 0,
          payment_method: row.payment_method,
          payment_date: row.payment_date,
          academic_year: row.academic_year,
          term: row.term,
          received_by: row.received_by,
          notes: row.notes,
          fee_items: [],
          created_at: row.created_at,
        };
      }
      map[rn].amount += Number(row.amount);
      map[rn].fee_items.push({
        fee_name: row.student_fee?.fee_structure?.fee_name || 'Fee',
        amount: Number(row.amount),
      });
    });
    return Object.values(map);
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
    paymentData: any,
    receiptNumber: string,
  ): Observable<FeePayment> {
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
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as FeePayment;
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

  importStudentsFromFile(file: File): Observable<ImportResult> {
    return from(this.processStudentFileImport(file));
  }

  private async processStudentFileImport(file: File): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      return this.processStudentExcelImport(file);
    }
    return this.processStudentCSVImport(file);
  }

  private async processStudentExcelImport(file: File): Promise<ImportResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    if (!rows.length) throw new Error('File is empty or invalid');

    // Load classes once for name→id lookup
    const { data: classes } = await this.supabase.client
      .from('school_classes')
      .select('id, name, academic_year')
      .eq('church_id', this.churchId)
      .eq('is_active', true);

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      try {
        const row: Record<string, string> = {};
        Object.entries(rows[i]).forEach(([key, val]) => {
          row[key.trim().toLowerCase().replace(/\s+/g, '_')] = String(
            val ?? '',
          ).trim();
        });

        const classId = this.resolveClassId(
          row['class'] || row['class_name'],
          classes || [],
        );
        if (!classId)
          throw new Error(
            `Class "${row['class'] || row['class_name']}" not found`,
          );

        await this.insertStudentRow(row, classId);
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ row: i + 2, error: err.message, data: '' });
      }
    }
    return results;
  }

  private async processStudentCSVImport(file: File): Promise<ImportResult> {
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

    const headers = lines[0].split(',').map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
    );

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',');
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx]?.trim() || '';
        });

        const classId = this.resolveClassId(
          row['class'] || row['class_name'],
          classes || [],
        );
        if (!classId)
          throw new Error(
            `Class "${row['class'] || row['class_name']}" not found`,
          );

        await this.insertStudentRow(row, classId);
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ row: i + 1, error: err.message, data: lines[i] });
      }
    }
    return results;
  }

  private resolveClassId(className: string, classes: any[]): string | null {
    if (!className) return null;
    const match = classes.find(
      (c) => c.name.toLowerCase().trim() === className.toLowerCase().trim(),
    );
    return match?.id || null;
  }

  private async insertStudentRow(
    row: Record<string, string>,
    classId: string,
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
      gender: row['gender']?.toLowerCase() || null,
      class_id: classId,
      parent_name: row['parent_name'] || null,
      parent_phone: row['parent_phone'] || row['phone'] || null,
      parent_email: row['parent_email'] || row['email'] || null,
      address: row['address'] || null,
      is_active: true,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}
