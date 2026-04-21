import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { currentAcademicYear, generateAcademicYears, TERMS } from '../../../models/school.model';
import { FeedingService } from '../../reports/services/feeding.service';

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
  selectedTerm = TERMS[0];
  selectedYear = currentAcademicYear();
  terms = TERMS;
  academicYears = generateAcademicYears();

  // Settings
  dailyAmount = 0;
  settingsLoaded = false;

  // Students
  classes: any[] = [];
  selectedClassId = '';
  students: any[] = [];
  loadingStudents = false;

  // Search
  searchQuery = '';
  searchResults: any[] = [];
  searching = false;
  showSearchResults = false;

  // Per-student state
  studentStates: { [studentId: string]: any } = {};

  // Daily summary
  dailySummary: any = null;
  loadingSummary = false;

  // UI
  errorMessage = '';
  successMessage = '';

  // Payment modal
  showPaymentModal = false;
  paymentStudent: any = null;
  paymentAmount = 0;
  paymentNotes = '';
  processingPayment = false;

  constructor(
    private feedingService: FeedingService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.churchId = this.route.snapshot.paramMap.get('churchId') || '';

    if (!this.churchId) {
      this.errorMessage = 'Invalid page link — school ID is missing.';
      return;
    }

    this.loadSchoolInfo();
    this.loadClasses();
    this.loadDailySettings();
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

  // ── Settings ──────────────────────────────────────────────

  loadDailySettings(): void {
    if (!this.churchId) return;
    this.feedingService
      .getSettings(this.churchId, this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (settings) => {
          this.dailyAmount = settings?.daily_amount || 0;
          this.settingsLoaded = true;
          this.cdr.markForCheck();
        },
      });
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
          this.studentStates = {}; // reset all state
          students.forEach((s) => {
            this.studentStates[s.id] = this.defaultStudentState();
          });
          this.loadingStudents = false;
          // Load attendance AND summaries together, then refresh UI once
          this.loadAttendanceAndSummaries(students.map((s) => s.id));
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingStudents = false;
          this.cdr.markForCheck();
        },
      });
  }

  private defaultStudentState() {
    return {
      isPresent: true,
      attendanceId: null,
      saving: false,
      summary: null,
      loadingSummary: true,
      error: '',
    };
  }

  // ── Combined attendance + summaries load ──────────────────
  // Loads attendance for the current date then fetches all summaries.
  // Using Promise.all so the UI updates atomically rather than
  // student-by-student which caused the flickering / missed updates.

  private async loadAttendanceAndSummaries(studentIds: string[]): Promise<void> {
    if (!studentIds.length) return;

    try {
      // 1. Attendance for today
      const attendance = await this.feedingService
        .getAttendancePromise(this.churchId, this.selectedDate, this.selectedYear, this.selectedTerm);

      const attendanceMap: { [studentId: string]: any } = {};
      attendance.forEach((r: any) => (attendanceMap[r.student_id] = r));

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid]) {
          this.studentStates[sid] = this.defaultStudentState();
        }
        const rec = attendanceMap[sid];
        if (rec) {
          this.studentStates[sid].isPresent = rec.is_present;
          this.studentStates[sid].attendanceId = rec.id;
        } else {
          // No record yet — default present, no ID (will INSERT on first toggle)
          this.studentStates[sid].isPresent = true;
          this.studentStates[sid].attendanceId = null;
        }
      });

      this.cdr.markForCheck();

      // 2. Summaries — parallel fetch for all students
      const summaries = await Promise.all(
        studentIds.map((sid) =>
          this.feedingService
            .getStudentFeedingSummaryPromise(this.churchId, sid, this.selectedYear, this.selectedTerm)
            .then((s) => ({ sid, summary: s }))
        )
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

  // ── Refresh a subset of students (after toggle / payment) ─

  private async refreshStudents(studentIds: string[]): Promise<void> {
    studentIds.forEach((sid) => {
      if (this.studentStates[sid]) this.studentStates[sid].loadingSummary = true;
    });
    this.cdr.markForCheck();
    await this.loadAttendanceAndSummaries(studentIds);
    await this.refreshDailySummary();
  }

  // ── Daily summary ─────────────────────────────────────────

  loadDailySummary(): void {
    if (!this.churchId) return;
    this.loadingSummary = true;
    this.feedingService
      .getDailySummary(this.churchId, this.selectedDate, this.selectedYear, this.selectedTerm)
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
        this.churchId, this.selectedDate, this.selectedYear, this.selectedTerm
      );
      this.dailySummary = s;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to refresh daily summary', err);
    }
  }

  // ── Filter change handlers ────────────────────────────────

  onDateChange(): void {
    // Reset attendance state but keep students; reload attendance for new date
    const ids = this.students.map((s) => s.id);
    ids.forEach((sid) => {
      if (this.studentStates[sid]) {
        this.studentStates[sid].isPresent = true;
        this.studentStates[sid].attendanceId = null;
        this.studentStates[sid].loadingSummary = true;
      }
    });
    this.cdr.markForCheck();
    if (ids.length) this.loadAttendanceAndSummaries(ids);
    this.loadDailySummary();
  }

  onTermYearChange(): void {
    this.loadDailySettings();
    const ids = this.students.map((s) => s.id);
    ids.forEach((sid) => {
      if (this.studentStates[sid]) {
        this.studentStates[sid].summary = null;
        this.studentStates[sid].loadingSummary = true;
      }
    });
    this.cdr.markForCheck();
    if (ids.length) this.loadAttendanceAndSummaries(ids);
    this.loadDailySummary();
  }

  onClassChange(): void {
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

    if (!this.studentStates[student.id]) {
      this.studentStates[student.id] = this.defaultStudentState();
    }

    this.loadAttendanceAndSummaries([student.id]);
  }

  closeSearch(): void {
    this.showSearchResults = false;
  }

  // ── Attendance toggle ─────────────────────────────────────

  toggleAttendance(studentId: string): void {
    const state = this.studentStates[studentId];
    if (!state || state.saving) return;

    // Optimistic update
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
          // Refresh summary + daily stats from DB to ensure consistency
          this.refreshStudents([studentId]);
        },
        error: (err) => {
          // Revert optimistic update
          state.isPresent = previousValue;
          state.saving = false;
          state.error = err.message || 'Failed to update attendance';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Payment Modal ─────────────────────────────────────────

  openPaymentModal(student: any): void {
    this.paymentStudent = student;
    const state = this.studentStates[student.id];
    const balance = state?.summary?.balance || 0;
    this.paymentAmount = balance > 0 ? balance : this.dailyAmount;
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
    if (!this.dailyAmount || this.dailyAmount <= 0) return 1;
    return Math.floor(this.paymentAmount / this.dailyAmount);
  }

  get paymentIsPartial(): boolean {
    if (!this.dailyAmount || this.dailyAmount <= 0) return false;
    return (
      this.paymentAmount % this.dailyAmount !== 0 ||
      this.paymentAmount < this.dailyAmount
    );
  }

  submitPayment(): void {
    if (!this.paymentStudent || !this.paymentAmount || this.paymentAmount <= 0) return;
    this.processingPayment = true;

    const studentId = this.paymentStudent.id;
    const studentName = this.getStudentName(this.paymentStudent);
    const amount = this.paymentAmount;

    this.feedingService
      .recordPayment({
        church_id: this.churchId,
        student_id: studentId,
        payment_date: this.selectedDate,
        academic_year: this.selectedYear,
        term: this.selectedTerm,
        amount_paid: amount,
        days_covered: this.paymentDaysCovered,
        notes: this.paymentNotes || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingPayment = false;
          this.closePaymentModal();
          this.successMessage = `Payment of ${this.formatCurrency(amount)} recorded for ${studentName}`;
          setTimeout(() => (this.successMessage = ''), 4000);
          // Refresh the specific student + daily stats from DB
          this.refreshStudents([studentId]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingPayment = false;
          this.errorMessage = err.message || 'Failed to record payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Helpers ───────────────────────────────────────────────

  getStudentName(student: any): string {
    if (!student) return '';
    return `${student.first_name} ${student.middle_name || ''} ${student.last_name}`.trim();
  }

  getPaymentStatus(studentId: string): 'paid' | 'partial' | 'unpaid' | 'absent' {
    const state = this.studentStates[studentId];
    if (!state) return 'unpaid';
    if (!state.isPresent) return 'absent';
    const summary = state.summary;
    if (!summary || !this.dailyAmount) return 'unpaid';
    if (summary.balance <= 0) return 'paid';
    if (summary.totalPaid > 0) return 'partial';
    return 'unpaid';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  trackByStudentId(_: number, student: any): string {
    return student.id;
  }
}
