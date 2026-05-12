import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  currentAcademicYear,
  generateAcademicYears,
  TERMS,
} from '../../../models/school.model';
import { FeedingService } from '../../reports/services/feeding.service';
import { FeedingFilterService } from '../../reports/services/feeding-filter.service';

interface StudentState {
  isPresent: boolean;
  attendanceId: string | null;
  saving: boolean;
  summary: {
    totalPaid: number;
    presentDays: number;
    totalOwed: number;
    balance: number;
    hasPayment: boolean;
    totalDaysCovered: number;
    prepaidDaysRemaining: number;
    creditBalance: number;
  } | null;
  loadingSummary: boolean;
  error: string;
  dailyRate: number;
}

// Spread day entry for the public timeline
export interface SpreadDayEntry {
  date: string; // YYYY-MM-DD or label like "Future Day 1"
  label: string; // display label e.g. "Thu, May 7"
  amountApplied: number; // portion of payment applied to this day
  isPresent: boolean | null;
  isFutureDay: boolean; // true for advance-covered days
  runningBalance: number;
  paymentId?: string | null;
  notes?: string | null;
}

@Component({
  selector: 'app-feeding-record',
  standalone: false,
  templateUrl: './feeding-record.html',
  styleUrl: './feeding-record.scss',
})
export class FeedingRecord implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  churchId = '';
  schoolName = '';

  // Filters
  selectedDate = new Date().toISOString().split('T')[0];
  selectedTerm = '';
  selectedYear = '';
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Classes
  classes: any[] = [];
  selectedClassId = '';

  // Students
  students: any[] = [];
  loadingStudents = false;

  // Search
  searchQuery = '';
  searchResults: any[] = [];
  searching = false;
  showSearchResults = false;

  // Per-student state
  studentStates: { [studentId: string]: StudentState } = {};

  // Daily summary
  dailySummary: any = null;
  loadingSummary = false;

  // UI messages
  errorMessage = '';
  successMessage = '';

  // ── Payment modal (create) ────────────────────────────────
  showPaymentModal = false;
  paymentStudent: any = null;
  paymentAmount = 0;
  paymentNotes = '';
  processingPayment = false;

  // ── Edit payment modal ────────────────────────────────────
  showEditModal = false;
  editPayment: any = null;
  editingStudent: any = null;
  editAmount = 0;
  editNotes = '';
  editDate = '';
  processingEdit = false;
  editError = '';
  studentPayments: any[] = [];
  loadingStudentPayments = false;

  // ── Custom delete confirm modal ───────────────────────────
  showDeleteConfirmModal = false;
  deleteTargetPayment: any = null;
  processingDelete = false;

  // ── Student detail modal (public) ────────────────────────
  showStudentDetailModal = false;
  studentDetailLoading = false;
  studentDetail: any = null;
  detailStudent: any = null;
  spreadTimeline: SpreadDayEntry[] = [];

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalStudents = 0;
  isShowingActiveStudents = false;

  constructor(
    private feedingService: FeedingService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    public feedingFilter: FeedingFilterService,
  ) {}

  ngOnInit(): void {
    this.churchId = this.route.snapshot.paramMap.get('churchId') || '';
    if (!this.churchId) {
      this.errorMessage = 'Invalid page link — school ID is missing.';
      return;
    }

    this.selectedTerm = this.feedingFilter.term;
    this.selectedYear = this.feedingFilter.year;

    this.loadSchoolInfo();
    this.loadClasses();
    this.loadInitialStudents();
    this.loadDailySummary();

    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        if (query.length >= 2) this.doSearch(query);
        else {
          this.searchResults = [];
          this.showSearchResults = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── School info ───────────────────────────────────────────

  private async loadSchoolInfo(): Promise<void> {
    if (!this.churchId) return;
    const { data } = await (this.feedingService as any).supabase.client
      .from('churches')
      .select('name')
      .eq('id', this.churchId)
      .single();
    this.schoolName = data?.name || 'School';
    this.cdr.markForCheck();
  }

  // ── Classes ───────────────────────────────────────────────

  loadClasses(): void {
    if (!this.churchId) return;
    this.feedingService
      .getClasses(this.churchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => {
          this.classes = c;
          this.cdr.markForCheck();
        },
      });
  }

  async loadInitialStudents(): Promise<void> {
    if (!this.churchId) return;
    this.loadingStudents = true;
    this.cdr.markForCheck();

    const [attRes, payRes] = await Promise.all([
      (this.feedingService as any).supabase.client
        .from('feeding_attendance')
        .select('student_id')
        .eq('church_id', this.churchId)
        .eq('attendance_date', this.selectedDate)
        .eq('academic_year', this.selectedYear)
        .eq('term', this.selectedTerm),
      (this.feedingService as any).supabase.client
        .from('feeding_payments')
        .select('student_id')
        .eq('church_id', this.churchId)
        .eq('payment_date', this.selectedDate)
        .eq('academic_year', this.selectedYear)
        .eq('term', this.selectedTerm),
    ]);

    const todayActiveIds = new Set([
      ...(attRes.data || []).map((r: any) => r.student_id),
      ...(payRes.data || []).map((r: any) => r.student_id),
    ]);

    const allPaymentsRes = await (this.feedingService as any).supabase.client
      .from('feeding_payments')
      .select('student_id, amount_paid')
      .eq('church_id', this.churchId)
      .eq('academic_year', this.selectedYear)
      .eq('term', this.selectedTerm)
      .lte('payment_date', this.selectedDate);

    const allAttendanceRes = await (this.feedingService as any).supabase.client
      .from('feeding_attendance')
      .select('student_id')
      .eq('church_id', this.churchId)
      .eq('academic_year', this.selectedYear)
      .eq('term', this.selectedTerm)
      .eq('is_present', true)
      .lte('attendance_date', this.selectedDate);

    const paidMap: Record<string, number> = {};
    for (const p of allPaymentsRes.data || []) {
      paidMap[p.student_id] =
        (paidMap[p.student_id] || 0) + Number(p.amount_paid);
    }

    const presentMap: Record<string, number> = {};
    for (const a of allAttendanceRes.data || []) {
      presentMap[a.student_id] = (presentMap[a.student_id] || 0) + 1;
    }

    const studentIdsWithPayments = Object.keys(paidMap);
    let rateMap: Record<string, number> = {};

    if (studentIdsWithPayments.length > 0) {
      const { data: studentsWithClass } = await (
        this.feedingService as any
      ).supabase.client
        .from('students')
        .select('id, class:school_classes(id, tier)')
        .in('id', studentIdsWithPayments);

      if (studentsWithClass) {
        rateMap = await this.feedingService.resolveRatesForStudents(
          this.churchId,
          this.selectedYear,
          this.selectedTerm,
          studentsWithClass,
        );
      }
    }

    const prepaidStudentIds = new Set<string>();
    for (const studentId of studentIdsWithPayments) {
      const totalPaid = paidMap[studentId] || 0;
      const presentDays = presentMap[studentId] || 0;
      const rate = rateMap[studentId] || 0;
      if (rate > 0) {
        const totalOwed = presentDays * rate;
        const credit = totalPaid - totalOwed;
        if (credit >= rate) prepaidStudentIds.add(studentId);
      }
    }

    const allRelevantIds = Array.from(
      new Set([...todayActiveIds, ...prepaidStudentIds]),
    );

    if (allRelevantIds.length > 0) {
      const { data } = await (this.feedingService as any).supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name, tier)',
        )
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .in('id', allRelevantIds)
        .order('first_name');

      this.students = data || [];
      this.isShowingActiveStudents = true;
    } else {
      await this.loadAllStudentsPaginated(1);
      this.isShowingActiveStudents = false;
    }

    this.studentStates = {};
    this.students.forEach((s) => {
      this.studentStates[s.id] = this.defaultStudentState();
    });
    this.loadingStudents = false;

    if (this.students.length) this.loadAttendanceAndSummaries(this.students);
    this.cdr.markForCheck();
  }

  async loadAllStudentsPaginated(page: number): Promise<void> {
    const from = (page - 1) * this.pageSize;
    const to = from + this.pageSize - 1;

    const { data, count } = await (this.feedingService as any).supabase.client
      .from('students')
      .select(
        'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name, tier)',
        { count: 'exact' },
      )
      .eq('church_id', this.churchId)
      .eq('is_active', true)
      .order('first_name')
      .range(from, to);

    this.students = data || [];
    this.totalStudents = count || 0;
    this.currentPage = page;
  }

  goToPage(page: number): void {
    if (this.selectedClassId || this.isShowingActiveStudents) return;
    this.loadingStudents = true;
    this.cdr.markForCheck();
    this.loadAllStudentsPaginated(page).then(() => {
      this.studentStates = {};
      this.students.forEach((s) => {
        this.studentStates[s.id] = this.defaultStudentState();
      });
      this.loadingStudents = false;
      if (this.students.length) this.loadAttendanceAndSummaries(this.students);
      this.cdr.markForCheck();
    });
  }

  get totalPages(): number {
    return Math.ceil(this.totalStudents / this.pageSize);
  }

  loadStudentsByClass(): void {
    if (!this.selectedClassId) {
      this.students = [];
      this.studentStates = {};
      return;
    }
    this.loadingStudents = true;
    this.feedingService
      .getStudentsByClass(this.churchId, this.selectedClassId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (students) => {
          this.students = students;
          this.studentStates = {};
          students.forEach((s) => {
            this.studentStates[s.id] = this.defaultStudentState();
          });
          this.loadingStudents = false;
          this.loadAttendanceAndSummaries(students);
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingStudents = false;
          this.cdr.markForCheck();
        },
      });
  }

  private defaultStudentState(): StudentState {
    return {
      isPresent: true,
      attendanceId: null,
      saving: false,
      summary: null,
      loadingSummary: true,
      error: '',
      dailyRate: 0,
    };
  }

  private async loadAttendanceAndSummaries(students: any[]): Promise<void> {
    if (!students.length) return;
    const studentIds = students.map((s) => s.id);

    try {
      const rateMap = await this.feedingService.resolveRatesForStudents(
        this.churchId,
        this.selectedYear,
        this.selectedTerm,
        students,
      );

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid])
          this.studentStates[sid] = this.defaultStudentState();
        this.studentStates[sid].dailyRate = rateMap[sid] ?? 0;
      });

      const attendance = await this.feedingService.getAttendancePromise(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      );

      const attendanceMap: { [sid: string]: any } = {};
      attendance.forEach((r: any) => (attendanceMap[r.student_id] = r));

      studentIds.forEach((sid) => {
        const rec = attendanceMap[sid];
        if (rec) {
          this.studentStates[sid].isPresent = rec.is_present;
          this.studentStates[sid].attendanceId = rec.id;
        } else {
          this.studentStates[sid].isPresent = true;
          this.studentStates[sid].attendanceId = null;
        }
      });

      this.cdr.markForCheck();

      const summaries = await Promise.all(
        students.map((s) =>
          this.feedingService
            .getStudentFeedingSummaryPromise(
              this.churchId,
              s.id,
              this.selectedYear,
              this.selectedTerm,
              this.studentStates[s.id]?.dailyRate ?? 0,
            )
            .then((summary) => ({ sid: s.id, summary })),
        ),
      );

      summaries.forEach(({ sid, summary }) => {
        if (this.studentStates[sid]) {
          this.studentStates[sid].summary = summary;
          this.studentStates[sid].loadingSummary = false;

          // Auto-mark present if student has prepaid credit covering today
          // Only do this if no attendance record exists yet for today
          if (
            summary.prepaidDaysRemaining > 0 &&
            !this.studentStates[sid].attendanceId
          ) {
            this.autoMarkPresentForPrepaid(sid);
          }
        }
      });

      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('Failed to load attendance/summaries', err);
    }
  }

  private autoMarkPresentForPrepaid(studentId: string): void {
    const state = this.studentStates[studentId];
    if (!state || state.attendanceId) return; // already has a record

    // Optimistically set present
    state.isPresent = true;
    this.cdr.markForCheck();

    this.feedingService
      .upsertAttendance({
        church_id: this.churchId,
        student_id: studentId,
        attendance_date: this.selectedDate,
        academic_year: this.selectedYear,
        term: this.selectedTerm,
        is_present: true,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (record) => {
          if (this.studentStates[studentId]) {
            this.studentStates[studentId].attendanceId = record?.id || null;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          // Revert on failure
          if (this.studentStates[studentId]) {
            this.studentStates[studentId].isPresent = false;
          }
          this.cdr.markForCheck();
        },
      });
  }

  private async refreshStudents(studentObjects: any[]): Promise<void> {
    const ids = studentObjects.map((s) => s.id ?? s);
    ids.forEach((sid) => {
      if (this.studentStates[sid])
        this.studentStates[sid].loadingSummary = true;
    });
    this.cdr.markForCheck();
    await this.loadAttendanceAndSummaries(
      studentObjects.length > 0 && typeof studentObjects[0] === 'object'
        ? studentObjects
        : this.students.filter((s) => ids.includes(s.id)),
    );
    await this.refreshDailySummary();
  }

  loadDailySummary(): void {
    if (!this.churchId) return;
    this.loadingSummary = true;
    this.feedingService
      .getDailySummary(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.dailySummary = s;
          this.loadingSummary = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingSummary = false;
          this.cdr.markForCheck();
        },
      });
  }

  private async refreshDailySummary(): Promise<void> {
    if (!this.churchId) return;
    try {
      const s = await this.feedingService.getDailySummaryPromise(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      );
      this.dailySummary = s;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to refresh daily summary', err);
    }
  }

  onDateChange(): void {
    if (!this.selectedClassId) {
      this.students = [];
      this.studentStates = {};
      this.currentPage = 1;
      this.loadInitialStudents();
      this.loadDailySummary();
      return;
    }
    const ids = this.students.map((s) => s.id);
    ids.forEach((sid) => {
      if (this.studentStates[sid]) {
        this.studentStates[sid].isPresent = true;
        this.studentStates[sid].attendanceId = null;
        this.studentStates[sid].loadingSummary = true;
      }
    });
    this.cdr.markForCheck();
    if (this.students.length) this.loadAttendanceAndSummaries(this.students);
    this.loadDailySummary();
  }

  onTermYearChange(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
    const ids = this.students.map((s) => s.id);
    ids.forEach((sid) => {
      if (this.studentStates[sid]) {
        this.studentStates[sid].summary = null;
        this.studentStates[sid].loadingSummary = true;
        this.studentStates[sid].dailyRate = 0;
      }
    });
    this.cdr.markForCheck();
    if (this.students.length) this.loadAttendanceAndSummaries(this.students);
    this.loadDailySummary();
  }

  onClassChange(): void {
    if (this.churchId) {
      localStorage.setItem(
        `feeding_class_${this.churchId}`,
        this.selectedClassId,
      );
    }
    this.loadStudentsByClass();
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchResults = false;
  }

  studentCreditBalance(studentId: string | undefined): number {
    if (!studentId) return 0;
    return this.studentStates[studentId]?.summary?.creditBalance ?? 0;
  }

  studentPrepaidDaysRemaining(studentId: string | undefined): number {
    if (!studentId) return 0;
    return this.studentStates[studentId]?.summary?.prepaidDaysRemaining ?? 0;
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  doSearch(query: string): void {
    if (!this.churchId) return;
    this.searching = true;
    this.feedingService
      .searchStudents(this.churchId, query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.searchResults = results;
          this.showSearchResults = true;
          this.searching = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.searching = false;
          this.cdr.markForCheck();
        },
      });
  }

  selectStudentFromSearch(student: any): void {
    this.showSearchResults = false;
    this.searchQuery = '';
    if (!this.students.find((s) => s.id === student.id)) {
      this.students = [student, ...this.students];
    }
    this.studentStates[student.id] = this.defaultStudentState();
    this.loadAttendanceAndSummaries([student]);
  }

  closeSearch(): void {
    this.showSearchResults = false;
  }

  toggleAttendance(studentId: string): void {
    const state = this.studentStates[studentId];
    if (!state || state.saving) return;

    const previousValue = state.isPresent;
    state.isPresent = !state.isPresent;
    state.saving = true;
    state.error = '';
    this.cdr.markForCheck();

    this.feedingService
      .upsertAttendance({
        church_id: this.churchId,
        student_id: studentId,
        attendance_date: this.selectedDate,
        academic_year: this.selectedYear,
        term: this.selectedTerm,
        is_present: state.isPresent,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (record) => {
          state.attendanceId = record?.id || state.attendanceId;
          state.saving = false;
          this.cdr.markForCheck();
          const student = this.students.find((s) => s.id === studentId);
          if (student) this.refreshStudents([student]);
        },
        error: (err) => {
          state.isPresent = previousValue;
          state.saving = false;
          state.error = err.message || 'Failed to update attendance';
          this.cdr.markForCheck();
        },
      });
  }

  getPaymentStatus(
    studentId: string,
  ): 'paid' | 'prepaid' | 'partial' | 'unpaid' | 'absent' {
    const state = this.studentStates[studentId];
    if (!state) return 'unpaid';
    if (!state.isPresent) return 'absent';
    if (state.loadingSummary) return 'unpaid';
    const summary = state.summary;
    if (!summary) return 'unpaid';
    if (summary.prepaidDaysRemaining > 0) return 'prepaid';
    if (summary.hasPayment && summary.balance <= 0) return 'paid';
    if (summary.hasPayment && summary.totalPaid > 0) return 'partial';
    return 'unpaid';
  }

  isPrepaidToday(studentId: string): boolean {
    return this.getPaymentStatus(studentId) === 'prepaid';
  }
  getPrepaidDaysRemaining(studentId: string): number {
    return this.studentStates[studentId]?.summary?.prepaidDaysRemaining ?? 0;
  }
  get hasPrepaidStudents(): boolean {
    return this.students.some((s) => this.isPrepaidToday(s.id));
  }

  openPaymentModal(student: any): void {
    this.paymentStudent = student;
    const state = this.studentStates[student.id];
    const balance = state?.summary?.balance ?? 0;
    const rate = state?.dailyRate ?? 0;
    const credit = state?.summary?.creditBalance ?? 0;
    this.paymentAmount = credit > 0 ? rate : balance > 0 ? balance : rate;
    this.paymentNotes = '';
    this.showPaymentModal = true;
  }

  closePaymentModal(): void {
    this.showPaymentModal = false;
    this.paymentStudent = null;
    this.paymentAmount = 0;
    this.paymentNotes = '';
  }

  get paymentDaysCovered(): number {
    const rate = this.studentDailyRate(this.paymentStudent?.id);
    if (!rate || rate <= 0) return 1;
    return Math.max(1, Math.floor(this.paymentAmount / rate));
  }

  get paymentIsPartial(): boolean {
    const rate = this.studentDailyRate(this.paymentStudent?.id);
    if (!rate || rate <= 0) return false;
    return this.paymentAmount % rate !== 0 || this.paymentAmount < rate;
  }

  studentDailyRate(studentId: string | undefined): number {
    if (!studentId) return 0;
    return this.studentStates[studentId]?.dailyRate ?? 0;
  }

  submitPayment(): void {
    if (!this.paymentStudent || !this.paymentAmount || this.paymentAmount <= 0)
      return;
    if (this.processingPayment) return;
    this.processingPayment = true;

    const studentId = this.paymentStudent.id;
    const studentName = this.getStudentName(this.paymentStudent);
    const amount = this.paymentAmount;
    const rate = this.studentDailyRate(studentId);
    const daysCovered = rate > 0 ? Math.max(0, Math.floor(amount / rate)) : 1;
    const state = this.studentStates[studentId];

    this.feedingService
      .recordPayment({
        church_id: this.churchId,
        student_id: studentId,
        payment_date: this.selectedDate,
        academic_year: this.selectedYear,
        term: this.selectedTerm,
        amount_paid: amount,
        days_covered: daysCovered,
        notes: this.paymentNotes || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (!state?.attendanceId) {
            this.feedingService
              .upsertAttendance({
                church_id: this.churchId,
                student_id: studentId,
                attendance_date: this.selectedDate,
                academic_year: this.selectedYear,
                term: this.selectedTerm,
                is_present: true,
              })
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (rec) => {
                  if (state) {
                    state.isPresent = true;
                    state.attendanceId = rec?.id || null;
                  }
                },
              });
          }
          this.processingPayment = false;
          this.closePaymentModal();
          this.successMessage = `Payment of ${this.formatCurrency(amount)} recorded for ${studentName}`;
          setTimeout(() => (this.successMessage = ''), 4000);
          const student = this.students.find((s) => s.id === studentId);
          if (student) this.refreshStudents([student]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingPayment = false;
          this.errorMessage = err.message || 'Failed to record payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Edit payment modal ────────────────────────────────────

  async openEditModal(student: any): Promise<void> {
    this.editingStudent = student;
    this.editPayment = null;
    this.studentPayments = [];
    this.loadingStudentPayments = true;
    this.showEditModal = true;
    this.cdr.markForCheck();

    try {
      const { data, error } = await (this.feedingService as any).supabase.client
        .from('feeding_payments')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('student_id', student.id)
        .eq('academic_year', this.selectedYear)
        .eq('term', this.selectedTerm)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      this.studentPayments = data || [];
      if (this.studentPayments.length > 0)
        this.selectPaymentForEdit(this.studentPayments[0]);
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load payments';
    } finally {
      this.loadingStudentPayments = false;
      this.cdr.markForCheck();
    }
  }

  selectPaymentForEdit(payment: any): void {
    this.editPayment = payment;
    this.editAmount = Number(payment.amount_paid);
    this.editNotes = payment.notes || '';
    this.editDate = payment.payment_date;
    this.cdr.markForCheck();
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editPayment = null;
    this.editingStudent = null;
    this.editAmount = 0;
    this.editNotes = '';
    this.editDate = '';
    this.editError = '';
    this.studentPayments = [];
  }

  get editDaysCovered(): number {
    const rate = this.studentDailyRate(this.editingStudent?.id);
    if (!rate || rate <= 0) return 1;
    return Math.max(1, Math.floor(this.editAmount / rate));
  }

  submitEdit(): void {
    if (!this.editPayment || !this.editAmount || this.editAmount <= 0) return;
    this.processingEdit = true;
    this.editError = '';
    this.cdr.markForCheck();

    const rate = this.studentDailyRate(this.editingStudent?.id);
    const daysCovered =
      rate > 0 ? Math.max(0, Math.floor(this.editAmount / rate)) : 1;
    const studentRef = this.students.find(
      (s) => s.id === this.editingStudent?.id,
    );

    this.feedingService
      .updatePayment(this.editPayment.id, {
        amount_paid: this.editAmount,
        days_covered: daysCovered,
        notes: this.editNotes || undefined,
        payment_date: this.editDate,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingEdit = false;
          this.closeEditModal();
          this.successMessage = 'Payment updated successfully';
          setTimeout(() => (this.successMessage = ''), 3000);
          if (studentRef) this.refreshStudents([studentRef]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingEdit = false;
          this.editError = err.message || 'Failed to update payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Custom delete confirm modal ───────────────────────────

  deletePaymentRecord(payment: any): void {
    this.deleteTargetPayment = payment;
    this.showDeleteConfirmModal = true;
    this.cdr.markForCheck();
  }

  closeDeleteConfirmModal(): void {
    this.showDeleteConfirmModal = false;
    this.deleteTargetPayment = null;
    this.processingDelete = false;
  }

  confirmDeletePayment(): void {
    if (!this.deleteTargetPayment || this.processingDelete) return;
    this.processingDelete = true;
    this.cdr.markForCheck();

    const payment = this.deleteTargetPayment;

    this.feedingService
      .deletePayment(payment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingDelete = false;
          this.showDeleteConfirmModal = false;
          this.deleteTargetPayment = null;

          // Remove from local list if edit modal is open
          this.studentPayments = this.studentPayments.filter(
            (p) => p.id !== payment.id,
          );
          if (this.editPayment?.id === payment.id) {
            this.editPayment = null;
            if (this.studentPayments.length > 0)
              this.selectPaymentForEdit(this.studentPayments[0]);
          }

          const student = this.students.find(
            (s) => s.id === this.editingStudent?.id,
          );
          if (student) this.refreshStudents([student]);
          this.successMessage = 'Payment deleted successfully';
          setTimeout(() => (this.successMessage = ''), 3000);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingDelete = false;
          this.editError = err.message || 'Failed to delete payment';
          this.showDeleteConfirmModal = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Student detail modal (public page) ───────────────────

  async openStudentDetailModal(student: any): Promise<void> {
    this.detailStudent = student;
    this.studentDetailLoading = true;
    this.showStudentDetailModal = true;
    this.studentDetail = null;
    this.spreadTimeline = [];
    this.cdr.markForCheck();

    try {
      const rate = this.studentDailyRate(student.id);
      this.studentDetail = await this.feedingService.getStudentTermDetail(
        this.churchId,
        student.id,
        this.selectedYear,
        this.selectedTerm,
        rate,
      );
      this.spreadTimeline = this.buildSpreadTimeline(this.studentDetail, rate);
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load student details';
    } finally {
      this.studentDetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  closeStudentDetailModal(): void {
    this.showStudentDetailModal = false;
    this.studentDetail = null;
    this.detailStudent = null;
    this.spreadTimeline = [];
  }

  /**
   * Builds a spread timeline where each payment is broken down day by day.
   * e.g. GHS 30 at GHS 12/day → Day1: GHS 12, Day2: GHS 12, Day3: GHS 6
   * Future (advance) days are labelled sequentially after the last recorded date.
   */
  buildSpreadTimeline(detail: any, dailyRate: number): SpreadDayEntry[] {
    if (!detail || !dailyRate) return [];

    const payments: any[] = detail.payments || [];
    const attendance: any[] = detail.attendance || [];

    // Build maps
    const attMap: Record<string, boolean | null> = {};
    attendance.forEach((a: any) => {
      attMap[a.attendance_date] = a.is_present;
    });

    const paymentMap: Record<
      string,
      { amount: number; notes: string | null; id: string }
    > = {};
    payments.forEach((p: any) => {
      paymentMap[p.payment_date] = {
        amount: Number(p.amount_paid),
        notes: p.notes || null,
        id: p.id,
      };
    });

    // All dates that matter: payment dates + attendance dates, sorted
    const allDates = Array.from(
      new Set([
        ...payments.map((p: any) => p.payment_date),
        ...attendance
          .filter((a: any) => a.is_present)
          .map((a: any) => a.attendance_date),
      ]),
    ).sort();

    const result: SpreadDayEntry[] = [];

    // Running balance starts at 0, increases with payments, decreases with each present day
    let runningBalance = 0;

    for (const date of allDates) {
      const payment = paymentMap[date];
      const isPresent = attMap[date] ?? null;

      // Add payment first if one exists on this date
      if (payment) runningBalance += payment.amount;

      // Every present day consumes one day's rate
      const amountApplied = isPresent === true ? dailyRate : 0;
      if (isPresent === true) runningBalance -= dailyRate;

      result.push({
        date,
        label: this.formatDateLabel(date),
        amountApplied,
        isPresent,
        isFutureDay: false,
        runningBalance: parseFloat(runningBalance.toFixed(2)),
        paymentId: payment?.id || null,
        notes: payment?.notes || null,
      });
    }

    // Future advance days — consume remaining credit day by day
    let futureCounter = 1;
    while (runningBalance > 0) {
      const amountApplied = Math.min(runningBalance, dailyRate);
      runningBalance = parseFloat((runningBalance - amountApplied).toFixed(2));

      result.push({
        date: `future_${futureCounter}`,
        label: `Future Day ${futureCounter}`,
        amountApplied,
        isPresent: null,
        isFutureDay: true,
        runningBalance,
        paymentId: null,
        notes: null,
      });
      futureCounter++;
    }

    return result;
  }

  private formatDateLabel(dateStr: string): string {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  getStudentName(student: any): string {
    if (!student) return '';
    return `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  confirmTermYear(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  isToday(dateStr: string): boolean {
    return dateStr === this.today;
  }

  trackByStudentId(_: number, student: any): string {
    return student.id;
  }
  trackBySliceIndex(i: number): number {
    return i;
  }
}
