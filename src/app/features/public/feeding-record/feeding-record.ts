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
  studentFeedingFees: StudentFeedingFee[];
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  overallStatus: 'unpaid' | 'partial' | 'paid';
  loadingSummary: boolean;
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
  selectedClassId = '';

  allStudents: any[] = [];
  students: any[] = [];
  loadingStudents = false;
  totalStudents = 0;

  searchQuery = '';

  studentStates: { [studentId: string]: StudentState } = {};

  // Daily payments collected today
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
    this.loadAllStudents();
    this.loadDailyCollected();
    this.loadRecordingWindow();

    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.applySearch(q));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── School info ───────────────────────────────────────────────

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

  // ── Load all students ─────────────────────────────────────────

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

  applyClassFilter(): void {
    this.students = this.selectedClassId
      ? this.allStudents.filter((s) => s.class_id === this.selectedClassId)
      : [...this.allStudents];

    this.students.forEach((s) => {
      if (!this.studentStates[s.id]) {
        this.studentStates[s.id] = this.defaultState();
      }
    });

    if (this.students.length) this.loadFeeStates(this.students);
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
    };
  }

  // ── Load fee states (no attendance) ──────────────────────────

  private async loadFeeStates(students: any[]): Promise<void> {
    if (!students.length) return;
    const studentIds = students.map((s) => s.id);

    studentIds.forEach((sid) => {
      if (this.studentStates[sid])
        this.studentStates[sid].loadingSummary = true;
    });
    this.cdr.markForCheck();

    try {
      // Load in chunks of 50 to avoid URL length limits
      const allSffs: any[] = [];
      for (let i = 0; i < studentIds.length; i += 50) {
        const chunk = studentIds.slice(i, i + 50);
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

  private async refreshStudent(studentId: string): Promise<void> {
    const student = this.allStudents.find((s) => s.id === studentId);
    if (!student) return;
    if (this.studentStates[studentId])
      this.studentStates[studentId].loadingSummary = true;
    this.cdr.markForCheck();
    await this.loadFeeStates([student]);
    await this.refreshDailyCollected();
  }

  // ── Term/Year change ──────────────────────────────────────────

  onTermYearChange(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
    // Reset all states
    Object.keys(this.studentStates).forEach((sid) => {
      this.studentStates[sid] = this.defaultState();
    });
    if (this.students.length) this.loadFeeStates(this.students);
    this.loadDailyCollected();
  }

  onDateChange(): void {
    this.loadDailyCollected();
  }

  confirmTermYear(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
  }

  // ── Daily collected amount ────────────────────────────────────

  async loadDailyCollected(): Promise<void> {
    try {
      const { data } = await (this.feedingService as any).supabase.client
        .from('feeding_payments')
        .select('amount_paid')
        .eq('church_id', this.churchId)
        .eq('payment_date', this.selectedDate)
        .eq('academic_year', this.selectedYear)
        .eq('term', this.selectedTerm);
      this.dailyCollected = (data || []).reduce(
        (s: number, p: any) => s + Number(p.amount_paid),
        0,
      );
      this.cdr.markForCheck();
    } catch {}
  }

  private async refreshDailyCollected(): Promise<void> {
    await this.loadDailyCollected();
  }

  // ── Search (client-side) ──────────────────────────────────────

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
    if (this.students.length) this.loadFeeStates(this.students);
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyClassFilter();
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
    // Default to the outstanding balance; if fully paid default to daily rate
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
         churchId: this.churchId,
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
    return new Date().toISOString().split('T')[0];
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
}




