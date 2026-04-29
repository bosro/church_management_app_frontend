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
  } | null;
  loadingSummary: boolean;
  error: string;
  dailyRate: number; // resolved per-student rate (class override → tier → fallback)
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

  // Per-student state: includes resolved dailyRate per student
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
  editPayment: any = null; // the payment record being edited
  editingStudent: any = null; // the student it belongs to
  editAmount = 0;
  editNotes = '';
  editDate = '';
  processingEdit = false;
  editError = ''; // error shown inside edit modal
  // Full list of payments for a student (fetched on edit open)
  studentPayments: any[] = [];
  loadingStudentPayments = false;

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
    this.loadClasses(); // ← ADD THIS BACK
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
          // ← Remove the saved class restore block entirely
          this.cdr.markForCheck();
        },
      });
  }

  async loadInitialStudents(): Promise<void> {
    if (!this.churchId) return;
    this.loadingStudents = true;
    this.cdr.markForCheck();

    // 1. Find student IDs with activity today
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

    const activeIds = Array.from(
      new Set([
        ...(attRes.data || []).map((r: any) => r.student_id),
        ...(payRes.data || []).map((r: any) => r.student_id),
      ]),
    );

    if (activeIds.length > 0) {
      // Load just those students
      const { data } = await (this.feedingService as any).supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class:school_classes(id, name, tier)',
        )
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .in('id', activeIds)
        .order('first_name');

      this.students = data || [];
      this.isShowingActiveStudents = true;
    } else {
      // No activity yet — load all students paginated
      await this.loadAllStudentsPaginated(1);
      this.isShowingActiveStudents = false;
    }

    this.studentStates = {};
    this.students.forEach((s) => {
      this.studentStates[s.id] = this.defaultStudentState();
    });
    this.loadingStudents = false;

    if (this.students.length) {
      this.loadAttendanceAndSummaries(this.students);
    }
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
  // ── Students ──────────────────────────────────────────────

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

  // ── Combined load: attendance + per-student rates + summaries ─

  private async loadAttendanceAndSummaries(students: any[]): Promise<void> {
    if (!students.length) return;
    const studentIds = students.map((s) => s.id);

    try {
      // 1. Resolve per-student daily rates in one batch query
      const rateMap = await this.feedingService.resolveRatesForStudents(
        this.churchId,
        this.selectedYear,
        this.selectedTerm,
        students,
      );

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid]) {
          this.studentStates[sid] = this.defaultStudentState();
        }
        this.studentStates[sid].dailyRate = rateMap[sid] ?? 0;
      });

      // 2. Attendance for today
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
          // No record yet — new student, default to present but NOT yet persisted
          // Status will show as 'Unpaid' until attendance is toggled/payment made
          this.studentStates[sid].isPresent = true;
          this.studentStates[sid].attendanceId = null;
        }
      });

      this.cdr.markForCheck();

      // 3. Summaries — parallel fetch, pass resolved daily rate per student
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
        }
      });

      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('Failed to load attendance/summaries', err);
    }
  }

  // ── Refresh subset of students ────────────────────────────

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

  // ── Daily summary ─────────────────────────────────────────

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

  // ── Filter change handlers ────────────────────────────────

  onDateChange(): void {
    if (!this.selectedClassId) {
      // Reset and reload active students for new date
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
    // Persist selection so page reload restores it
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

  // ── Search ────────────────────────────────────────────────

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

    // Always init fresh state — do NOT carry over any cached "Paid" status
    this.studentStates[student.id] = this.defaultStudentState();
    this.loadAttendanceAndSummaries([student]);
  }

  closeSearch(): void {
    this.showSearchResults = false;
  }

  // ── Attendance toggle ─────────────────────────────────────

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

  // ── Payment status ────────────────────────────────────────
  // 'Paid' ONLY when hasPayment=true AND balance=0
  // This prevents searched students showing 'Paid' before any payment

  getPaymentStatus(
    studentId: string,
  ): 'paid' | 'prepaid' | 'partial' | 'unpaid' | 'absent' {
    const state = this.studentStates[studentId];
    if (!state) return 'unpaid';
    if (!state.isPresent) return 'absent';
    if (state.loadingSummary) return 'unpaid';
    const summary = state.summary;
    if (!summary) return 'unpaid';
    // Pre-paid: student has advance days already paid for
    if (summary.prepaidDaysRemaining > 0) return 'prepaid';
    // Fully paid for all days attended
    if (summary.hasPayment && summary.balance <= 0) return 'paid';
    // Partial payment made
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

  // ── Create payment modal ──────────────────────────────────

  openPaymentModal(student: any): void {
    this.paymentStudent = student;
    const state = this.studentStates[student.id];
    const balance = state?.summary?.balance ?? 0;
    const rate = state?.dailyRate ?? 0;
    this.paymentAmount = balance > 0 ? balance : rate;
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
    // Guard: prevent double-tap
    if (this.processingPayment) return;
    this.processingPayment = true;

    const studentId = this.paymentStudent.id;
    const studentName = this.getStudentName(this.paymentStudent);
    const amount = this.paymentAmount;
    const rate = this.studentDailyRate(studentId);
    const daysCovered = rate > 0 ? Math.max(1, Math.floor(amount / rate)) : 1;
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
          // Auto-mark student present if no attendance record exists yet.
          // A payment implies the student is physically there — this ensures
          // the attendance count reflects the payment count correctly.
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
      // Pre-select most recent payment
      if (this.studentPayments.length > 0) {
        this.selectPaymentForEdit(this.studentPayments[0]);
      }
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
    this.editError = ''; // clear any previous modal-level error
    this.cdr.markForCheck();

    const rate = this.studentDailyRate(this.editingStudent?.id);
    const daysCovered =
      rate > 0 ? Math.max(1, Math.floor(this.editAmount / rate)) : 1;
    // Capture before closing
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
        next: (updated) => {
          this.processingEdit = false;
          this.closeEditModal(); // close first, then refresh
          this.successMessage = 'Payment updated successfully';
          setTimeout(() => (this.successMessage = ''), 3000);
          if (studentRef) this.refreshStudents([studentRef]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingEdit = false;
          // Show error INSIDE the modal so the user sees it
          this.editError = err.message || 'Failed to update payment';
          this.cdr.markForCheck();
        },
      });
  }

  deletePaymentRecord(payment: any): void {
    if (
      !confirm(
        `Delete this payment of ${this.formatCurrency(payment.amount_paid)}? This cannot be undone.`,
      )
    )
      return;

    this.feedingService
      .deletePayment(payment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.studentPayments = this.studentPayments.filter(
            (p) => p.id !== payment.id,
          );
          if (this.editPayment?.id === payment.id) {
            this.editPayment = null;
            if (this.studentPayments.length > 0) {
              this.selectPaymentForEdit(this.studentPayments[0]);
            }
          }
          const student = this.students.find(
            (s) => s.id === this.editingStudent?.id,
          );
          if (student) this.refreshStudents([student]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete payment';
          this.cdr.markForCheck();
        },
      });
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

  trackByStudentId(_: number, student: any): string {
    return student.id;
  }
}

// ── Interfaces ────────────────────────────────────────────
