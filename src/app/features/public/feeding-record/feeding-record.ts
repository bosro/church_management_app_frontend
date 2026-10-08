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
import { FeedingPublicService, FeedingHoliday } from './feeding-public.service';

// ── Attendance status as the UI understands it ────────────────
// 'auto-present' : student has credit days remaining, no explicit record today
// 'present'      : teacher explicitly marked present
// 'absent'       : teacher explicitly marked absent
// 'unmarked'     : no payment credit and no explicit record
export type AttendanceDisplay = 'auto-present' | 'present' | 'absent' | 'unmarked';

export interface StudentDailyStatus {
  // From the DB RPC
  is_present: boolean | null;   // null = no record exists
  has_record: boolean;
  days_paid: number;
  days_attended: number;
  credit_days: number;
  // From get_feeding_daily_overview (attendance-aware money)
  covered_today: boolean;      // paid up through the viewed date
  leftover_amount: number;     // GHS paid but not yet "eaten" (e.g. absent days)
  owing_amount: number;        // GHS owed for days attended but not paid
  daily_rate: number;
  // Derived on the frontend
  displayStatus: AttendanceDisplay;
  savingAttendance: boolean;
}

interface StudentState {
  studentFeedingFees: StudentFeedingFee[];
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  overallStatus: 'unpaid' | 'partial' | 'paid';
  loadingSummary: boolean;
  dailyStatus: StudentDailyStatus | null;
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

  // ── Access (PIN) + term confirmation ──────────────────────────
  authState: 'checking' | 'locked' | 'term-confirm' | 'ready' = 'checking';
  pin = '';
  pinError = '';
  pinAttemptsLeft: number | null = null;
  verifyingPin = false;

  holidays: FeedingHoliday[] = [];
  adminTerm = '';
  adminYear = '';
  termSetByAdmin = false;
  confirmTerm = '';
  confirmYear = '';
  changingTerm = false;

  selectedDate = FeedingRecord.lastSchoolDay(new Date());
  selectedTerm = '';
  selectedYear = '';
  terms = TERMS;
  academicYears = generateAcademicYears();

  classes: any[] = [];
  selectedClassId = '';

  allStudents: any[] = [];
  students: any[] = [];
  loadingStudents = false;
  totalStudents = 0;

  searchQuery = '';

  studentStates: { [studentId: string]: StudentState } = {};

  dailyCollected = 0;

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

  // ── History modal ─────────────────────────────────────────────
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

  showEditPaymentModal = false;
  editTargetPayment: any = null;
  editTargetSff: StudentFeedingFee | null = null;
  editPaymentAmount = 0;
  editPaymentMethod = 'Cash';
  editPaymentNotes = '';
  processingEdit = false;

  // ── Attendance dropdown open state ────────────────────────────
  openAttendanceDropdownId: string | null = null;

  // ── Money summary (week) + expenses ───────────────────────────
  weekCollected = 0;
  weekExpensesTotal = 0;
  weekExpenses: any[] = [];
  termLeftoverTotal = 0;     // carry-forward credit across ALL students
  termOwingTotal = 0;
  showExpenseModal = false;
  savingExpense = false;
  expenseTitle = '';
  expenseAmount: number | null = null;
  expenseNote = '';
  expenseDate = '';
  expenseBy = '';
  private readonly TEACHER_NAME_KEY = 'churchman_feeding_teacher_name';

  // ── Weekend helpers ───────────────────────────────────────────

  /** Returns true if the given date string falls on Saturday or Sunday. */
  static isWeekend(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  }

  /** Instance wrapper so the template can call isWeekend(selectedDate). */
  isWeekend(dateStr: string): boolean {
    return FeedingRecord.isWeekend(dateStr);
  }

  /**
   * Returns the most recent school day (Mon–Fri) on or before `date`.
   * If today is Saturday → Friday. If Sunday → Friday.
   */
  static lastSchoolDay(date: Date = new Date()): string {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1); // Sat → Fri
    if (day === 0) d.setDate(d.getDate() - 2); // Sun → Fri
    return d.toISOString().split('T')[0];
  }

  constructor(
    private feedingService: FeedingService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    public feedingFilter: FeedingFilterService,
    private pub: FeedingPublicService,
  ) {}

  ngOnInit(): void {
    this.churchId = this.route.snapshot.paramMap.get('churchId') || '';
    if (!this.churchId) {
      this.errorMessage = 'Invalid page link — school ID is missing.';
      return;
    }
    this.pub.init(this.churchId);

    this.selectedTerm = this.feedingFilter.term;
    this.selectedYear = this.feedingFilter.year;

    try {
      this.expenseBy = localStorage.getItem(this.TEACHER_NAME_KEY) || '';
    } catch {}

    this.pub.sessionExpired$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.authState = 'locked';
      this.pin = '';
      this.pinError = 'Your session has ended. Please enter the PIN again.';
      this.cdr.markForCheck();
    });

    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.applySearch(q));

    this.restoreSession();
  }

  // ── PIN + session ─────────────────────────────────────────────

  private async restoreSession(): Promise<void> {
    if (!this.pub.getToken()) {
      this.authState = 'locked';
      this.cdr.markForCheck();
      return;
    }
    try {
      await this.loadBootstrapAndContinue();
    } catch {
      this.authState = 'locked';
      this.cdr.markForCheck();
    }
  }

  async submitPin(): Promise<void> {
    if (!this.pin.trim() || this.verifyingPin) return;
    this.verifyingPin = true;
    this.pinError = '';
    this.cdr.markForCheck();
    try {
      const res = await this.pub.verifyPin(this.pin.trim());
      if (!res.ok) {
        this.pinError = res.error || 'Wrong PIN.';
        this.pinAttemptsLeft = res.attempts_left ?? null;
        this.pin = '';
        return;
      }
      this.pin = '';
      this.pinAttemptsLeft = null;
      await this.loadBootstrapAndContinue();
    } catch (err: any) {
      this.pinError = err.message || 'Could not check the PIN. Try again.';
    } finally {
      this.verifyingPin = false;
      this.cdr.markForCheck();
    }
  }

  private async loadBootstrapAndContinue(): Promise<void> {
    const b = await this.pub.bootstrap();
    this.schoolName = b.school_name || 'School';
    this.classes = b.classes || [];
    this.activeRecordingWindow = b.window || null;
    this.windowLoaded = true;
    this.holidays = b.holidays || [];
    this.adminYear = b.active_year || '';
    this.adminTerm = b.active_term || '';
    this.termSetByAdmin = !!(b.active_year && b.active_term);

    const year = this.adminYear || this.feedingFilter.year;
    const term = this.adminTerm || this.feedingFilter.term;

    // Already confirmed in this browser tab? Go straight in.
    if (this.termSetByAdmin && this.pub.isTermConfirmed(year, term)) {
      this.enterPage(term, year);
      return;
    }
    this.confirmTerm = term;
    this.confirmYear = year;
    this.changingTerm = !this.termSetByAdmin; // admin hasn't set one → teacher chooses
    this.authState = 'term-confirm';
    this.cdr.markForCheck();
  }

  /** Teacher taps "Yes, this is correct" (or picks another term and confirms). */
  confirmTermAndStart(): void {
    this.pub.markTermConfirmed(this.confirmYear, this.confirmTerm);
    this.enterPage(this.confirmTerm, this.confirmYear);
  }

  private enterPage(term: string, year: string): void {
    this.selectedTerm = term;
    this.selectedYear = year;
    this.feedingFilter.setBoth(term, year);
    this.authState = 'ready';
    this.loadAllStudents();
    this.loadDailyCollected();
    this.loadWeekMoney();
    this.cdr.markForCheck();
  }

  lockPage(): void {
    this.pub.clearSession();
    this.authState = 'locked';
    this.pinError = '';
    this.cdr.markForCheck();
  }

  // ── Holidays ──────────────────────────────────────────────────
  holidayName(dateStr: string): string | null {
    const h = this.holidays.find((x) => dateStr >= x.from_date && dateStr <= x.to_date);
    return h ? h.name : null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load all students ─────────────────────────────────────────

  async loadAllStudents(): Promise<void> {
    this.loadingStudents = true;
    this.cdr.markForCheck();
    try {
      const data = await this.pub.students();
      this.allStudents = data;
      this.totalStudents = data.length;
      this.applyClassFilter();
    } catch (err: any) {
      if (err.message !== 'SESSION_EXPIRED')
        this.errorMessage = err.message || 'Failed to load students';
    } finally {
      this.loadingStudents = false;
      this.cdr.markForCheck();
    }
  }

  applyClassFilter(): void {
    this.students = this.selectedClassId
      ? this.allStudents.filter((s) => s.class_id === this.selectedClassId)
      : [...this.allStudents];

    this.students.forEach((s) => {
      if (!this.studentStates[s.id]) {
        this.studentStates[s.id] = this.defaultState();
      }
    });

    if (this.students.length) {
      this.loadFeeStates(this.students);
      this.loadDailyStatuses(this.students);
    }
    this.cdr.markForCheck();
  }

  onClassChange(): void {
    this.searchQuery = '';
    this.applyClassFilter();
  }

  private defaultState(): StudentState {
    return {
      studentFeedingFees: [],
      totalDue: 0,
      totalPaid: 0,
      totalBalance: 0,
      overallStatus: 'unpaid',
      loadingSummary: true,
      dailyStatus: null,
    };
  }

  // ── Load fee states ───────────────────────────────────────────

  private async loadFeeStates(students: any[]): Promise<void> {
    if (!students.length) return;
    const studentIds = students.map((s) => s.id);

    studentIds.forEach((sid) => {
      if (this.studentStates[sid])
        this.studentStates[sid].loadingSummary = true;
    });
    this.cdr.markForCheck();

    try {
      const allSffs: any[] = await this.pub.fees(this.selectedYear, this.selectedTerm);

      const byStudent: { [sid: string]: any[] } = {};
      allSffs.forEach((f) => {
        if (!byStudent[f.student_id]) byStudent[f.student_id] = [];
        byStudent[f.student_id].push(f);
      });

      studentIds.forEach((sid) => {
        if (!this.studentStates[sid]) return;
        const fees = byStudent[sid] || [];
        const totalDue = fees.reduce(
          (s: number, f: any) => s + Number(f.amount_due),
          0,
        );
        const totalPaid = fees.reduce(
          (s: number, f: any) => s + Number(f.amount_paid),
          0,
        );

        let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (fees.length > 0) {
          if (fees.every((f: any) => f.status === 'paid')) status = 'paid';
          else if (fees.some((f: any) => f.amount_paid > 0)) status = 'partial';
        }

        this.studentStates[sid] = {
          ...this.studentStates[sid],
          studentFeedingFees: fees,
          totalDue,
          totalPaid,
          totalBalance: totalDue - totalPaid,
          overallStatus: status,
          loadingSummary: false,
        };
      });

      this.cdr.markForCheck();
    } catch (err: any) {
      studentIds.forEach((sid) => {
        if (this.studentStates[sid])
          this.studentStates[sid].loadingSummary = false;
      });
      this.cdr.markForCheck();
    }
  }

  // ── Load daily attendance statuses ────────────────────────────
  // Uses get_feeding_daily_overview, which returns a row for EVERY student
  // with a fee assigned — including students who have not paid yet, so they
  // can be marked absent on a Monday.
  private overviewByStudent: { [sid: string]: any } = {};

  async loadDailyStatuses(students: any[]): Promise<void> {
    if (!students.length) return;
    try {
      const data = await this.pub.overview(
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
      );

      const byStudent: { [sid: string]: any } = {};
      (data || []).forEach((row: any) => {
        byStudent[row.student_id] = row;
      });
      this.overviewByStudent = byStudent;

      // Totals across every student (not just the filtered list)
      let left = 0, owe = 0;
      Object.values(byStudent).forEach((r: any) => {
        left += Number(r.leftover_amount || 0);
        owe += Number(r.owing_amount || 0);
      });
      this.termLeftoverTotal = left;
      this.termOwingTotal = owe;

      students.forEach((s) => {
        if (!this.studentStates[s.id]) return;
        const row = byStudent[s.id];
        if (row) {
          this.studentStates[s.id].dailyStatus = {
            is_present:      row.is_present,
            has_record:      row.has_record,
            days_paid:       0,
            days_attended:   Number(row.expected_days || 0),
            credit_days:     Number(row.credit_days || 0),
            covered_today:   !!row.covered_today,
            leftover_amount: Number(row.leftover_amount || 0),
            owing_amount:    Number(row.owing_amount || 0),
            daily_rate:      Number(row.daily_rate || 0),
            displayStatus:   this.computeDisplayStatus(row),
            savingAttendance: false,
          };
        } else {
          // No fee assigned this term — attendance does not apply
          this.studentStates[s.id].dailyStatus = null;
        }
      });

      this.cdr.markForCheck();
    } catch (err: any) {
      console.warn('Failed to load daily statuses:', err.message);
      if (err.message === 'SESSION_EXPIRED') return;
      this.errorMessage =
        'Could not load attendance. Please refresh the page. (' + err.message + ')';
      this.cdr.markForCheck();
    }
  }

  // ── Compute display status from DB row ────────────────────────
  // Logic:
  //   explicit absent record           → 'absent'
  //   explicit present record          → 'present'
  //   no record + has credit days      → 'auto-present' (paid coverage)
  //   no record + no credit            → 'unmarked'
  private computeDisplayStatus(row: {
    is_present: boolean | null;
    has_record: boolean;
    covered_today: boolean;
  }): AttendanceDisplay {
    if (row.has_record) {
      return row.is_present ? 'present' : 'absent';
    }
    return row.covered_today ? 'auto-present' : 'unmarked';
  }

  // ── Mark attendance ───────────────────────────────────────────

  async markAttendance(studentId: string, isPresent: boolean): Promise<void> {
    const state = this.studentStates[studentId];
    if (!state?.dailyStatus) return;
    if (!this.isDateAllowed(this.selectedDate)) return;

    this.openAttendanceDropdownId = null;
    state.dailyStatus.savingAttendance = true;
    this.cdr.markForCheck();

    try {
      await this.pub.setAttendance(
        studentId,
        this.selectedDate,
        this.selectedYear,
        this.selectedTerm,
        isPresent,
      );

      // Re-read from the database so leftover / owing amounts are exact
      const student = this.allStudents.find((s) => s.id === studentId);
      if (student) await this.loadDailyStatuses([student]);
      // Leftover totals can change for everyone's view; keep the rest in sync
      if (state.dailyStatus) state.dailyStatus.savingAttendance = false;
      this.cdr.markForCheck();
    } catch (err: any) {
      if (state.dailyStatus) state.dailyStatus.savingAttendance = false;
      this.errorMessage = err.message || 'Failed to save attendance';
      this.cdr.markForCheck();
    }
  }

  toggleAttendanceDropdown(studentId: string): void {
    this.openAttendanceDropdownId =
      this.openAttendanceDropdownId === studentId ? null : studentId;
    this.cdr.markForCheck();
  }

  closeAllDropdowns(): void {
    this.openAttendanceDropdownId = null;
    this.cdr.markForCheck();
  }

  // ── Term/Year/Date change ─────────────────────────────────────

  onTermYearChange(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
    Object.keys(this.studentStates).forEach((sid) => {
      this.studentStates[sid] = this.defaultState();
    });
    if (this.students.length) {
      this.loadFeeStates(this.students);
      this.loadDailyStatuses(this.students);
    }
    this.loadDailyCollected();
    this.loadWeekMoney();
  }

  onDateChange(): void {
    this.loadDailyCollected();
    this.loadWeekMoney();
    // Reload attendance for the newly selected date
    if (this.students.length) {
      this.loadDailyStatuses(this.students);
    }
  }

  confirmTermYear(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
  }

  private async refreshStudent(studentId: string): Promise<void> {
    const student = this.allStudents.find((s) => s.id === studentId);
    if (!student) return;
    if (this.studentStates[studentId])
      this.studentStates[studentId].loadingSummary = true;
    this.cdr.markForCheck();
    await this.loadFeeStates([student]);
    await this.loadDailyStatuses([student]);
    await this.loadDailyCollected();
    await this.loadWeekMoney();
  }

  // ── Daily collected amount ────────────────────────────────────

  async loadDailyCollected(): Promise<void> {
    try {
      this.dailyCollected = await this.pub.collected(
        this.selectedYear,
        this.selectedTerm,
        this.selectedDate,
        this.selectedDate,
      );
      this.cdr.markForCheck();
    } catch {}
  }

  // ── Week money + expenses ─────────────────────────────────────

  /** Monday–Friday of the week containing `dateStr`, as YYYY-MM-DD (local). */
  private weekRange(dateStr: string): { from: string; to: string } {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();                       // 0 Sun … 6 Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d); mon.setDate(d.getDate() + mondayOffset);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const f = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { from: f(mon), to: f(fri) };
  }

  get weekLabel(): string {
    const r = this.weekRange(this.selectedDate);
    return `${this.formatDateLabel(r.from)} – ${this.formatDateLabel(r.to)}`;
  }

  /** Cash the teacher should hand over = collected − expenses (this week). */
  get weekCashToHandOver(): number {
    return this.weekCollected - this.weekExpensesTotal;
  }

  async loadWeekMoney(): Promise<void> {
    const r = this.weekRange(this.selectedDate);
    try {
      const [collected, expenses] = await Promise.all([
        this.pub.collected(this.selectedYear, this.selectedTerm, r.from, r.to),
        this.pub.expenses(this.selectedYear, this.selectedTerm, r.from, r.to),
      ]);
      this.weekCollected = collected;
      this.weekExpenses = expenses;
      this.weekExpensesTotal = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('Failed to load week money', e?.message);
    }
  }

  openExpenseModal(): void {
    this.expenseTitle = '';
    this.expenseAmount = null;
    this.expenseNote = '';
    this.expenseDate = this.selectedDate;
    this.showExpenseModal = true;
  }

  closeExpenseModal(): void {
    this.showExpenseModal = false;
    this.savingExpense = false;
  }

  get canSaveExpense(): boolean {
    return (
      !this.savingExpense &&
      !!this.expenseTitle.trim() &&
      !!this.expenseBy.trim() &&
      !!this.expenseAmount && this.expenseAmount > 0 &&
      !!this.expenseDate
    );
  }

  async submitExpense(): Promise<void> {
    if (!this.canSaveExpense) return;
    this.savingExpense = true;
    try {
      await this.pub.recordExpense({
        year: this.selectedYear,
        term: this.selectedTerm,
        amount: this.expenseAmount as number,
        date: this.expenseDate,
        title: this.expenseTitle,
        description: this.expenseNote,
        enteredBy: this.expenseBy,
      });

      try { localStorage.setItem(this.TEACHER_NAME_KEY, this.expenseBy.trim()); } catch {}
      const amt = this.expenseAmount;
      this.closeExpenseModal();
      this.successMessage = `Expense of ${this.formatCurrency(amt || 0)} recorded. The admin can see it.`;
      setTimeout(() => (this.successMessage = ''), 5000);
      await this.loadWeekMoney();
    } catch (err: any) {
      this.savingExpense = false;
      this.errorMessage = err.message || 'Failed to record expense';
    }
    this.cdr.markForCheck();
  }

  // ── Search ────────────────────────────────────────────────────

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  private applySearch(query: string): void {
    if (!query || query.length < 1) {
      this.applyClassFilter();
      return;
    }
    const q = query.toLowerCase();
    this.students = this.allStudents.filter((s) => {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase();
      const num = (s.student_number || '').toLowerCase();
      const classMatch = this.selectedClassId
        ? s.class_id === this.selectedClassId
        : true;
      return classMatch && (name.includes(q) || num.includes(q));
    });
    this.students.forEach((s) => {
      if (!this.studentStates[s.id])
        this.studentStates[s.id] = this.defaultState();
    });
    if (this.students.length) {
      this.loadFeeStates(this.students);
      this.loadDailyStatuses(this.students);
    }
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyClassFilter();
  }

  // ── Edit Payment ──────────────────────────────────────────────

  openEditPayment(payment: any): void {
    this.editTargetPayment = payment;
    this.editPaymentAmount = Number(payment.amount_paid);
    this.editPaymentMethod = payment.payment_method || 'Cash';
    this.editPaymentNotes = payment.notes || '';
    const state = this.studentStates[this.historyStudent?.id];
    this.editTargetSff =
      state?.studentFeedingFees?.find(
        (f) => f.id === payment.student_feeding_fee_id,
      ) ||
      state?.studentFeedingFees?.[0] ||
      null;
    this.showEditPaymentModal = true;
  }

  closeEditPaymentModal(): void {
    this.showEditPaymentModal = false;
    this.editTargetPayment = null;
    this.editTargetSff = null;
    this.editPaymentAmount = 0;
    this.editPaymentNotes = '';
    this.processingEdit = false;
  }

  get editPaymentDaysApplied(): number {
    const rate = this.editTargetSff?.daily_amount || 0;
    if (!rate || !this.editPaymentAmount) return 0;
    return Math.floor(this.editPaymentAmount / rate);
  }

  get editPaymentIsPartial(): boolean {
    const rate = this.editTargetSff?.daily_amount || 0;
    return rate > 0 && this.editPaymentAmount % rate !== 0;
  }

  confirmEditPayment(): void {
    if (
      !this.editTargetPayment ||
      !this.editPaymentAmount ||
      this.editPaymentAmount <= 0
    )
      return;
    if (this.processingEdit) return;

    this.processingEdit = true;
    const rate = this.editTargetSff?.daily_amount || 0;
    const daysApplied =
      rate > 0 ? Math.max(0, Math.floor(this.editPaymentAmount / rate)) : 1;

    this.pub
      .updatePayment(this.editTargetPayment.id, {
        amount_paid: this.editPaymentAmount,
        days_covered: daysApplied,
        payment_method: this.editPaymentMethod,
        notes: this.editPaymentNotes || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.processingEdit = false;
          this.historyPayments = this.historyPayments.map((p) =>
            p.id === this.editTargetPayment.id
              ? {
                  ...p,
                  amount_paid: this.editPaymentAmount,
                  days_covered: daysApplied,
                  payment_method: this.editPaymentMethod,
                  notes: this.editPaymentNotes || null,
                }
              : p,
          );
          this.closeEditPaymentModal();
          this.successMessage = `Payment updated to ${this.formatCurrency(this.editPaymentAmount)}`;
          setTimeout(() => (this.successMessage = ''), 4000);
          this.refreshStudent(this.editTargetPayment.student_id);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingEdit = false;
          this.errorMessage = err.message || 'Failed to update payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Payment Modal ─────────────────────────────────────────────

  openPaymentModal(student: any, sff?: StudentFeedingFee): void {
    this.paymentStudent = student;
    const state = this.studentStates[student.id];
    const fees = state?.studentFeedingFees || [];

    this.paymentSff =
      sff || fees.find((f) => f.status !== 'paid') || fees[0] || null;

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
    return rate > 0 && this.paymentAmount % rate !== 0;
  }

  submitPayment(): void {
    if (
      !this.paymentStudent ||
      !this.paymentAmount ||
      this.paymentAmount <= 0 ||
      !this.paymentSff
    )
      return;
    if (this.processingPayment) return;

    this.processingPayment = true;
    const studentId = this.paymentStudent.id;
    const amount = this.paymentAmount;
    const rate = this.paymentSff.daily_amount || 0;
    const daysApplied = rate > 0 ? Math.max(0, Math.floor(amount / rate)) : 1;

    this.pub
      .recordPayment({
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
          this.processingPayment = false;
          this.closePaymentModal();
          this.successMessage = `Payment of ${this.formatCurrency(amount)} recorded!`;
          setTimeout(() => (this.successMessage = ''), 4000);
          this.refreshStudent(studentId);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.processingPayment = false;
          this.errorMessage = err.message || 'Failed to record payment';
          this.cdr.markForCheck();
        },
      });
  }

  // ── History Modal ─────────────────────────────────────────────

  async openHistoryModal(student: any): Promise<void> {
    this.historyStudent = student;
    this.historyPayments = [];
    this.loadingHistory = true;
    this.showHistoryModal = true;
    this.cdr.markForCheck();

    try {
      this.historyPayments = await this.pub.studentPayments(
        student.id,
        this.selectedYear,
        this.selectedTerm,
      );
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

    this.pub
      .deletePayment(payment.id)
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
          this.refreshStudent(payment.student_id);
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

  isDateAllowed(dateStr: string): boolean {
    // Weekends are never valid recording days
    if (FeedingRecord.isWeekend(dateStr)) return false;
    if (this.holidayName(dateStr)) return false;
    if (dateStr === this.today) return true;
    if (!this.activeRecordingWindow) return false;
    return (
      dateStr >= this.activeRecordingWindow.allow_from &&
      dateStr <= this.activeRecordingWindow.allow_to
    );
  }

  // ── Helpers ───────────────────────────────────────────────────

  getStudentName(s: any): string {
    if (!s) return '';
    return `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  formatDateLabel(d: string): string {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-GH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return d;
    }
  }

  get today(): string {
    // The max-date cap on the date input should be the last school day,
    // not a raw calendar today (which might be a weekend).
    return FeedingRecord.lastSchoolDay(new Date());
  }

  get displayCount(): string {
    const f = this.students.length;
    const t = this.allStudents.length;
    return f === t
      ? `${t} student${t !== 1 ? 's' : ''}`
      : `${f} of ${t} students`;
  }

  trackById(_: number, s: any): string {
    return s.id;
  }

  // ── Attendance summary for the summary bar ────────────────────

  get attendanceSummary(): { present: number; absent: number; unmarked: number } {
    let present = 0, absent = 0, unmarked = 0;
    this.students.forEach((s) => {
      const ds = this.studentStates[s.id]?.dailyStatus;
      if (!ds) { unmarked++; return; }
      if (ds.displayStatus === 'absent') { absent++; }
      else if (ds.displayStatus === 'present' || ds.displayStatus === 'auto-present') { present++; }
      else { unmarked++; }
    });
    return { present, absent, unmarked };
  }
}



