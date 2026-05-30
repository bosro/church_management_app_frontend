import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { generateAcademicYears, TERMS } from '../../../models/school.model';
import {
  FeedingService,
  StudentFeedingFee,
} from '../../reports/services/feeding.service';
import { FeedingFilterService } from '../../reports/services/feeding-filter.service';

interface StudentState {
  isPresent: boolean;
  attendanceId: string | null;
  saving: boolean;
  studentFeedingFees: StudentFeedingFee[];
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  overallStatus: 'unpaid' | 'partial' | 'paid';
  loadingSummary: boolean;
  error: string;
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

  selectedDate = new Date().toISOString().split('T')[0];
  selectedTerm = '';
  selectedYear = '';
  terms = TERMS;
  academicYears = generateAcademicYears();

  classes: any[] = [];
  selectedClassId = ''; // '' = show all

  // All students loaded once on init
  allStudents: any[] = [];
  students: any[] = []; // filtered view
  loadingStudents = false;
  totalStudents = 0;

  searchQuery = '';
  searchResults: any[] = [];
  searching = false;
  showSearchResults = false;

  studentStates: { [studentId: string]: StudentState } = {};

  dailySummary: any = null;

  errorMessage = '';
  successMessage = '';

  // ── Payment modal ─────────────────────────────────────────────
  showPaymentModal = false;
  paymentStudent: any = null;
  paymentSff: StudentFeedingFee | null = null;
  paymentAmount = 0;
  paymentNotes = '';
  paymentMethod = 'Cash';
  processingPayment = false;

  // ── Payment history modal ─────────────────────────────────────
  showHistoryModal = false;
  historyStudent: any = null;
  historyPayments: any[] = [];
  loadingHistory = false;

  // ── Delete confirm ────────────────────────────────────────────
  showDeleteConfirm = false;
  deleteTargetPayment: any = null;
  processingDelete = false;

  // Recording window
  activeRecordingWindow: any = null;
  windowLoaded = false;

  paymentMethods = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'];

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
    this.loadAllStudents(); // ← load ALL students on init
    this.loadDailySummary();
    this.loadRecordingWindow();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.applySearch(q));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── School Info ───────────────────────────────────────────────

  private async loadSchoolInfo(): Promise<void> {
    const { data } = await (this.feedingService as any).supabase.client
      .from('churches')
      .select('name')
      .eq('id', this.churchId)
      .single();
    this.schoolName = data?.name || 'School';
    this.cdr.markForCheck();
  }

  // ── Classes ───────────────────────────────────────────────────

  loadClasses(): void {
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

  // ── Load ALL students (default view) ─────────────────────────

  async loadAllStudents(): Promise<void> {
    this.loadingStudents = true;
    this.cdr.markForCheck();

    try {
      const { data, count } = await (this.feedingService as any).supabase.client
        .from('students')
        .select(
          'id, first_name, last_name, middle_name, student_number, class_id, class:school_classes(id, name, tier)',
          { count: 'exact' },
        )
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .order('first_name');

      this.allStudents = data || [];
      this.totalStudents = count || 0;
      this.applyClassFilter();
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load students';
    } finally {
      this.loadingStudents = false;
      this.cdr.markForCheck();
    }
  }

  // Apply class filter to already-loaded allStudents
  applyClassFilter(): void {
    if (this.selectedClassId) {
      this.students = this.allStudents.filter(
        (s) => s.class_id === this.selectedClassId,
      );
    } else {
      this.students = [...this.allStudents];
    }

    // Init states for any new students
    this.students.forEach((s) => {
      if (!this.studentStates[s.id]) {
        this.studentStates[s.id] = this.defaultState();
      }
    });

    // Load attendance + fees for visible students
    if (this.students.length) {
      this.loadAttendanceAndSummaries(this.students);
    }
    this.cdr.markForCheck();
  }

  onClassChange(): void {
    this.applyClassFilter();
    // Clear search when class changes
    this.searchQuery = '';
    this.showSearchResults = false;
  }

  private defaultState(): StudentState {
    return {
      isPresent: true,
      attendanceId: null,
      saving: false,
      studentFeedingFees: [],
      totalDue: 0,
      totalPaid: 0,
      totalBalance: 0,
      overallStatus: 'unpaid',
      loadingSummary: true,
      error: '',
    };
  }

  // ── Load attendance + fees for visible students ───────────────

  private async loadAttendanceAndSummaries(students: any[]): Promise<void> {
    if (!students.length) return;
    const studentIds = students.map((s) => s.id);

    // Mark all as loading
    studentIds.forEach((sid) => {
      if (this.studentStates[sid]) {
        this.studentStates[sid].loadingSummary = true;
      }
    });
    this.cdr.markForCheck();

    try {
      // 1. Attendance for today
      const attendance = await this.feedingService.getAttendancePromise(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      );
      const attMap: { [sid: string]: any } = {};
      attendance.forEach((r: any) => (attMap[r.student_id] = r));

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid])
          this.studentStates[sid] = this.defaultState();
        const rec = attMap[sid];
        if (rec) {
          this.studentStates[sid].isPresent = rec.is_present;
          this.studentStates[sid].attendanceId = rec.id;
        } else {
          this.studentStates[sid].isPresent = true;
          this.studentStates[sid].attendanceId = null;
        }
      });

      this.cdr.markForCheck();

      // 2. student_feeding_fees for each student in chunks of 50
      const chunkSize = 50;
      const allSffs: any[] = [];

      for (let i = 0; i < studentIds.length; i += chunkSize) {
        const chunk = studentIds.slice(i, i + chunkSize);
        const { data } = await (this.feedingService as any).supabase.client
          .from('student_feeding_fees')
          .select(
            '*, feeding_fee_structure:feeding_fee_structures(fee_name, daily_amount, total_days)',
          )
          .eq('church_id', this.churchId)
          .eq('academic_year', this.selectedYear)
          .eq('term', this.selectedTerm)
          .in('student_id', chunk);

        if (data) allSffs.push(...data);
      }

      // Group by student
      const sffByStudent: { [sid: string]: any[] } = {};
      allSffs.forEach((sff) => {
        if (!sffByStudent[sff.student_id]) sffByStudent[sff.student_id] = [];
        sffByStudent[sff.student_id].push(sff);
      });

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid]) return;
        const fees = sffByStudent[sid] || [];
        const totalDue = fees.reduce(
          (sum: number, f: any) => sum + Number(f.amount_due),
          0,
        );
        const totalPaid = fees.reduce(
          (sum: number, f: any) => sum + Number(f.amount_paid),
          0,
        );

        let overallStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (fees.length > 0) {
          if (fees.every((f: any) => f.status === 'paid'))
            overallStatus = 'paid';
          else if (
            fees.some((f: any) => f.status === 'partial' || f.status === 'paid')
          )
            overallStatus = 'partial';
        }

        this.studentStates[sid].studentFeedingFees = fees;
        this.studentStates[sid].totalDue = totalDue;
        this.studentStates[sid].totalPaid = totalPaid;
        this.studentStates[sid].totalBalance = totalDue - totalPaid;
        this.studentStates[sid].overallStatus = overallStatus;
        this.studentStates[sid].loadingSummary = false;
      });

      this.cdr.markForCheck();
    } catch (err: any) {
      console.error('Failed to load summaries', err);
      studentIds.forEach((sid) => {
        if (this.studentStates[sid])
          this.studentStates[sid].loadingSummary = false;
      });
      this.cdr.markForCheck();
    }
  }

  private async refreshStudent(student: any): Promise<void> {
    if (this.studentStates[student.id]) {
      this.studentStates[student.id].loadingSummary = true;
    }
    this.cdr.markForCheck();
    await this.loadAttendanceAndSummaries([student]);
    await this.refreshDailySummary();
  }

  // ── Date / Term / Year ────────────────────────────────────────

  onDateChange(): void {
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
    // Reset all summaries
    Object.keys(this.studentStates).forEach((sid) => {
      this.studentStates[sid].studentFeedingFees = [];
      this.studentStates[sid].totalDue = 0;
      this.studentStates[sid].totalPaid = 0;
      this.studentStates[sid].totalBalance = 0;
      this.studentStates[sid].loadingSummary = true;
    });
    if (this.students.length) this.loadAttendanceAndSummaries(this.students);
    this.loadDailySummary();
  }

  confirmTermYear(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
  }

  // ── Daily Summary ─────────────────────────────────────────────

  loadDailySummary(): void {
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
          this.cdr.markForCheck();
        },
      });
  }

  private async refreshDailySummary(): Promise<void> {
    try {
      const s = await this.feedingService.getDailySummaryPromise(
        this.churchId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      );
      this.dailySummary = s;
      this.cdr.markForCheck();
    } catch {}
  }

  // ── Attendance toggle ─────────────────────────────────────────

  toggleAttendance(studentId: string): void {
    const state = this.studentStates[studentId];
    if (!state || state.saving) return;

    const prev = state.isPresent;
    state.isPresent = !state.isPresent;
    state.saving = true;
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
        next: (rec) => {
          state.attendanceId = rec?.id || state.attendanceId;
          state.saving = false;
          this.cdr.markForCheck();
          this.refreshDailySummary();
        },
        error: (err) => {
          state.isPresent = prev;
          state.saving = false;
          state.error = err.message || 'Failed to update attendance';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Search ────────────────────────────────────────────────────

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  private applySearch(query: string): void {
    if (!query || query.length < 1) {
      // Reset to class-filtered view
      this.applyClassFilter();
      this.showSearchResults = false;
      return;
    }

    const q = query.toLowerCase();
    this.students = this.allStudents.filter((s) => {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase();
      const num = (s.student_number || '').toLowerCase();
      // Also respect class filter if one is active
      const classMatch = this.selectedClassId
        ? s.class_id === this.selectedClassId
        : true;
      return classMatch && (name.includes(q) || num.includes(q));
    });

    // Init states for any students not yet loaded
    this.students.forEach((s) => {
      if (!this.studentStates[s.id]) {
        this.studentStates[s.id] = this.defaultState();
      }
    });

    if (this.students.length) this.loadAttendanceAndSummaries(this.students);
    this.cdr.markForCheck();
  }

  // Keep old search dropdown for finding students NOT in current class filter
  doExternalSearch(query: string): void {
    if (!query || query.length < 2) {
      this.searchResults = [];
      this.showSearchResults = false;
      return;
    }
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
    if (!this.allStudents.find((s) => s.id === student.id)) {
      this.allStudents = [student, ...this.allStudents];
    }
    if (!this.students.find((s) => s.id === student.id)) {
      this.students = [student, ...this.students];
    }
    if (!this.studentStates[student.id]) {
      this.studentStates[student.id] = this.defaultState();
    }
    this.loadAttendanceAndSummaries([student]);
  }

  // ── Payment Modal ─────────────────────────────────────────────

  openPaymentModal(student: any, sff?: StudentFeedingFee): void {
    this.paymentStudent = student;
    const state = this.studentStates[student.id];

    if (sff) {
      this.paymentSff = sff;
    } else {
      const fees = state?.studentFeedingFees || [];
      this.paymentSff =
        fees.find((f) => f.status !== 'paid') || fees[0] || null;
    }

    const balance = this.paymentSff
      ? Number(this.paymentSff.amount_due) - Number(this.paymentSff.amount_paid)
      : 0;
    this.paymentAmount =
      balance > 0 ? balance : this.paymentSff?.daily_amount || 0;
    this.paymentNotes = '';
    this.paymentMethod = 'Cash';
    this.showPaymentModal = true;
  }

  closePaymentModal(): void {
    this.showPaymentModal = false;
    this.paymentStudent = null;
    this.paymentSff = null;
    this.paymentAmount = 0;
    this.paymentNotes = '';
  }

  get paymentDaysApplied(): number {
    const rate = this.paymentSff?.daily_amount || 0;
    if (!rate || !this.paymentAmount) return 0;
    return Math.floor(this.paymentAmount / rate);
  }

  get paymentIsPartial(): boolean {
    const rate = this.paymentSff?.daily_amount || 0;
    if (!rate) return false;
    return this.paymentAmount % rate !== 0;
  }

  submitPayment(): void {
    if (!this.paymentStudent || !this.paymentAmount || this.paymentAmount <= 0)
      return;
    if (!this.paymentSff) return;
    if (this.processingPayment) return;

    this.processingPayment = true;
    const studentId = this.paymentStudent.id;
    const amount = this.paymentAmount;
    const rate = this.paymentSff.daily_amount || 0;
    const daysApplied = rate > 0 ? Math.max(0, Math.floor(amount / rate)) : 1;

    this.feedingService
      .recordFeedingPayment({
        studentId,
        studentFeedingFeeId: this.paymentSff.id,
        amount,
        paymentDate: this.selectedDate,
        academicYear: this.selectedYear,
        term: this.selectedTerm,
        daysApplied,
        paymentMethod: this.paymentMethod,
        notes: this.paymentNotes || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Auto mark present if not already
          const state = this.studentStates[studentId];
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
          this.successMessage = `Payment of ${this.formatCurrency(amount)} recorded!`;
          setTimeout(() => (this.successMessage = ''), 4000);
          const student = this.allStudents.find((s) => s.id === studentId);
          if (student) this.refreshStudent(student);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingPayment = false;
          this.errorMessage = err.message || 'Failed to record payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Payment History ───────────────────────────────────────────

  async openHistoryModal(student: any): Promise<void> {
    this.historyStudent = student;
    this.historyPayments = [];
    this.loadingHistory = true;
    this.showHistoryModal = true;
    this.cdr.markForCheck();

    try {
      const { data } = await (this.feedingService as any).supabase.client
        .from('feeding_payments')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('student_id', student.id)
        .eq('academic_year', this.selectedYear)
        .eq('term', this.selectedTerm)
        .order('payment_date', { ascending: false });
      this.historyPayments = data || [];
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load history';
    } finally {
      this.loadingHistory = false;
      this.cdr.markForCheck();
    }
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
    this.historyStudent = null;
    this.historyPayments = [];
  }

  // ── Delete Payment ────────────────────────────────────────────

  promptDeletePayment(payment: any): void {
    this.deleteTargetPayment = payment;
    this.showDeleteConfirm = true;
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm = false;
    this.deleteTargetPayment = null;
    this.processingDelete = false;
  }

  confirmDeletePayment(): void {
    if (!this.deleteTargetPayment || this.processingDelete) return;
    this.processingDelete = true;
    const payment = this.deleteTargetPayment;

    this.feedingService
      .deleteFeedingPayment(payment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingDelete = false;
          this.showDeleteConfirm = false;
          this.deleteTargetPayment = null;
          this.historyPayments = this.historyPayments.filter(
            (p) => p.id !== payment.id,
          );
          this.successMessage = 'Payment deleted';
          setTimeout(() => (this.successMessage = ''), 3000);
          const student = this.allStudents.find(
            (s) => s.id === payment.student_id,
          );
          if (student) this.refreshStudent(student);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingDelete = false;
          this.errorMessage = err.message || 'Failed to delete';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Recording Window ──────────────────────────────────────────

  async loadRecordingWindow(): Promise<void> {
    try {
      this.activeRecordingWindow =
        await this.feedingService.getActiveRecordingWindowPromise(
          this.churchId,
        );
    } catch {
      this.activeRecordingWindow = null;
    } finally {
      this.windowLoaded = true;
      this.cdr.markForCheck();
    }
  }

  isDateAllowed(dateStr: string): boolean {
    if (dateStr === this.today) return true;
    if (!this.activeRecordingWindow) return false;
    return (
      dateStr >= this.activeRecordingWindow.allow_from &&
      dateStr <= this.activeRecordingWindow.allow_to
    );
  }

  // ── Helpers ───────────────────────────────────────────────────

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

  formatDateLabel(dateStr: string): string {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  get displayCount(): string {
    const filtered = this.students.length;
    const total = this.allStudents.length;
    if (filtered === total) return `${total} student${total !== 1 ? 's' : ''}`;
    return `${filtered} of ${total} student${total !== 1 ? 's' : ''}`;
  }

  trackByStudentId(_: number, student: any): string {
    return student.id;
  }
}
