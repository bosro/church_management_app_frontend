import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  FeedingService,
  FeedingFeeStructure,
  StudentFeedingFee,
  FeedingPayment,
} from '../../../services/feeding.service';
import { AuthService } from '../../../../../core/services/auth';
import {
  TERMS,
  generateAcademicYears,
} from '../../../../../models/school.model';
import { FeedingFilterService } from '../../../services/feeding-filter.service';
import { SupabaseService } from '../../../../../core/services/supabase';

@Component({
  selector: 'app-feeding-admin',
  standalone: false,
  templateUrl: './feeding-admin.html',
  styleUrl: './feeding-admin.scss',
})
export class FeedingAdmin implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  churchId = '';
  selectedTerm = '';
  selectedYear = '';
  terms = TERMS;
  academicYears = generateAcademicYears();

  // ── Fee Structures ────────────────────────────────────────────
  feeStructures: FeedingFeeStructure[] = [];
  loadingStructures = false;
  classes: any[] = [];

  showStructureModal = false;
  editingStructure: FeedingFeeStructure | null = null;

  structureForm = {
    selectedClassIds: [] as string[],
    fee_name: 'Feeding Fee',
    daily_amount: 0,
    total_days: 0,
    academic_year: '',
    term: '',
  };
  savingStructure = false;

  showDeleteStructureModal = false;
  structureToDelete: FeedingFeeStructure | null = null;
  deletingStructure = false;

  // ── Assign to class/student ───────────────────────────────────
  showAssignClassModal = false;
  assignClassStructure: FeedingFeeStructure | null = null;
  assignClassId = '';
  assigningClass = false;

  showAssignStudentModal = false;
  assignStudentStructure: FeedingFeeStructure | null = null;
  studentSearchQuery = '';
  studentSearchResults: any[] = [];
  searchingStudents = false;
  selectedStudentId = '';
  selectedStudentName = '';
  assignCustomAmount: number | null = null;
  useCustomAmount = false;
  assigningStudent = false;

  // ── Assigned students modal ───────────────────────────────────
  showAssignedStudentsModal = false;
  assignedStudentsStructure: FeedingFeeStructure | null = null;
  assignedStudentsList: any[] = [];
  loadingAssignedStudents = false;
  unassigningId: string | null = null;
  unassignError = '';

  // ── Student Feeding Fees list ─────────────────────────────────
  studentFeedingFees: StudentFeedingFee[] = [];
  loadingStudentFees = false;
  selectedClassFilter = '';
  showOutstandingOnly = false;

  // ── Payments ──────────────────────────────────────────────────
  payments: FeedingPayment[] = [];
  loadingPayments = false;
  selectedDate = new Date().toISOString().split('T')[0];
  dailySummary: any = null;

  showEditPaymentModal = false;
  editingPayment: any = null;
  editPaymentAmount = 0;
  editPaymentDate = '';
  editPaymentNotes = '';
  editPaymentMethod = 'Cash';
  savingPayment = false;

  // ── Student detail modal ──────────────────────────────────────
  showStudentDetailModal = false;
  studentDetail: any = null;
  studentDetailLoading = false;

  // ── Recording window ──────────────────────────────────────────
  activeWindow: any = null;
  showWindowModal = false;
  windowFrom = '';
  windowTo = '';
  windowReason = '';
  savingWindow = false;
  windowHistory: any[] = [];
  showWindowHistory = false;

  // ── Statistics ────────────────────────────────────────────────
  stats: any = null;

  // ── Public link ───────────────────────────────────────────────
  publicLink = '';
  linkCopied = false;

  // ── Active tab ────────────────────────────────────────────────
  activeTab: 'structures' | 'student-fees' | 'payments' = 'structures';

  errorMessage = '';
  successMessage = '';

  paymentMethods = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'];

  expensesSummary: {
    total_collected: number;
    total_expenses: number;
    net_balance: number;
    expense_count: number;
  } | null = null;

  loadingExpensesSummary = false;

  constructor(
    private feedingService: FeedingService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    public router: Router,
    private feedingFilter: FeedingFilterService,
    private supabase: SupabaseService, // ← ADD THIS
  ) {}

  ngOnInit(): void {
    this.churchId = this.authService.getChurchId() || '';
    this.publicLink = `${window.location.origin}/public/feeding-fees/${this.churchId}`;
    this.selectedTerm = this.feedingFilter.term;
    this.selectedYear = this.feedingFilter.year;

    this.loadClasses();
    this.loadFeeStructures();
    this.loadStudentFeedingFees();
    this.loadPayments();
    this.loadDailySummary();
    this.loadStats();
    this.loadActiveWindow();
    this.loadExpensesSummary();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilterChange(): void {
    this.feedingFilter.setBoth(this.selectedTerm, this.selectedYear);
    this.loadFeeStructures();
    this.loadStudentFeedingFees();
    this.loadPayments();
    this.loadDailySummary();
    this.loadStats();
  }

  onDateChange(): void {
    this.loadPayments();
    this.loadDailySummary();
  }

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

  loadExpensesSummary(): void {
    this.loadingExpensesSummary = true;
    const churchId = this.authService.getChurchId() || '';

    this.supabase.client
      .rpc('get_feeding_expenses_summary', {
        p_church_id: churchId,
        p_academic_year: this.selectedYear,
        p_term: this.selectedTerm,
      })
      .then(({ data, error }) => {
        this.loadingExpensesSummary = false;
        if (error) {
          this.cdr.markForCheck();
          return;
        }
        if (Array.isArray(data) && data.length > 0) {
          this.expensesSummary = data[0];
        } else {
          this.expensesSummary = data;
        }
        this.cdr.markForCheck();
      });
  }

  getExpensesSpentPercent(): number {
    if (!this.expensesSummary || this.expensesSummary.total_collected === 0)
      return 0;
    const pct = Math.round(
      (this.expensesSummary.total_expenses /
        this.expensesSummary.total_collected) *
        100,
    );
    return Math.min(pct, 100); // cap at 100 for the bar width; label still shows real %
  }

  loadFeeStructures(): void {
    this.loadingStructures = true;
    this.feedingService
      .getFeedingFeeStructures(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (structures) => {
          this.feeStructures = structures;
          this.loadingStructures = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load fee structures';
          this.loadingStructures = false;
          this.cdr.markForCheck();
        },
      });
  }

  get groupedFeeStructures(): {
    class: any;
    structures: FeedingFeeStructure[];
  }[] {
    const groups: { [key: string]: FeedingFeeStructure[] } = {};
    this.feeStructures.forEach((s) => {
      const key = s.class_id || '__general__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.keys(groups).map((key) => ({
      class:
        key === '__general__'
          ? { id: '__general__', name: 'General (All Classes)' }
          : groups[key][0].class || { id: key, name: 'Unknown Class' },
      structures: groups[key],
    }));
  }

  // ── Create / Edit ─────────────────────────────────────────────

  openCreateStructure(): void {
    this.editingStructure = null;
    this.structureForm = {
      selectedClassIds: [],
      fee_name: 'Feeding Fee',
      daily_amount: 0,
      total_days: 0,
      academic_year: this.selectedYear,
      term: this.selectedTerm,
    };
    this.showStructureModal = true;
    this.errorMessage = '';
  }

  openEditStructure(s: FeedingFeeStructure): void {
    this.editingStructure = s;
    this.structureForm = {
      selectedClassIds: s.class_id ? [s.class_id] : [],
      fee_name: s.fee_name,
      daily_amount: s.daily_amount,
      total_days: s.total_days,
      academic_year: s.academic_year,
      term: s.term,
    };
    this.showStructureModal = true;
    this.errorMessage = '';
  }

  get previewTotal(): number {
    return (
      (this.structureForm.daily_amount || 0) *
      (this.structureForm.total_days || 0)
    );
  }

  toggleClassSelection(classId: string): void {
    const idx = this.structureForm.selectedClassIds.indexOf(classId);
    if (idx === -1) {
      this.structureForm.selectedClassIds = [
        ...this.structureForm.selectedClassIds,
        classId,
      ];
    } else {
      this.structureForm.selectedClassIds =
        this.structureForm.selectedClassIds.filter((id) => id !== classId);
    }
  }

  isClassSelected(classId: string): boolean {
    return this.structureForm.selectedClassIds.includes(classId);
  }

  toggleAllClasses(): void {
    if (this.structureForm.selectedClassIds.length === this.classes.length) {
      this.structureForm.selectedClassIds = [];
    } else {
      this.structureForm.selectedClassIds = this.classes.map((c) => c.id);
    }
  }

  get allClassesSelected(): boolean {
    return (
      this.classes.length > 0 &&
      this.structureForm.selectedClassIds.length === this.classes.length
    );
  }

  get someClassesSelected(): boolean {
    return (
      this.structureForm.selectedClassIds.length > 0 &&
      this.structureForm.selectedClassIds.length < this.classes.length
    );
  }

  async saveStructure(): Promise<void> {
    if (
      !this.structureForm.fee_name ||
      !this.structureForm.daily_amount ||
      !this.structureForm.total_days
    ) {
      this.errorMessage =
        'Fee name, daily amount, and number of days are required';
      return;
    }
    this.savingStructure = true;
    this.errorMessage = '';

    try {
      if (this.editingStructure) {
        const classId = this.structureForm.selectedClassIds[0] || null;
        await this.feedingService
          .updateFeedingFeeStructure(this.editingStructure.id, {
            class_id: classId,
            fee_name: this.structureForm.fee_name,
            daily_amount: this.structureForm.daily_amount,
            total_days: this.structureForm.total_days,
            academic_year: this.structureForm.academic_year,
            term: this.structureForm.term,
          })
          .toPromise();

        await this.syncStudentFeesAfterEdit(this.editingStructure.id);
        this.showSuccess(
          'Fee structure updated! Unpaid student fees have been synced automatically.',
        );
      } else {
        const classIds =
          this.structureForm.selectedClassIds.length > 0
            ? this.structureForm.selectedClassIds
            : [null];

        let totalAssigned = 0;

        for (const classId of classIds) {
          // Step 1: create the structure
          const created = await this.feedingService
            .createFeedingFeeStructure({
              class_id: classId,
              fee_name: this.structureForm.fee_name,
              daily_amount: this.structureForm.daily_amount,
              total_days: this.structureForm.total_days,
              academic_year: this.structureForm.academic_year,
              term: this.structureForm.term,
            })
            .toPromise();

          // Step 2: auto-assign to all students in the class
          if (classId && created?.id) {
            try {
              const count = await this.feedingService
                .assignFeedingFeeToClass(
                  created.id,
                  classId,
                  this.structureForm.academic_year,
                  this.structureForm.term,
                )
                .toPromise();
              totalAssigned += (count as number) || 0;
            } catch (assignErr) {
              console.warn('Auto-assign failed for class', classId, assignErr);
            }
          }
        }

        const classCount = this.structureForm.selectedClassIds.length;
        if (classCount > 0 && totalAssigned > 0) {
          this.showSuccess(
            `Fee structure created and automatically assigned to ${totalAssigned} student(s) across ${classCount} class(es)!`,
          );
        } else if (classCount > 0 && totalAssigned === 0) {
          this.showSuccess(
            `Fee structure created for ${classCount} class(es). No students were found — make sure students are enrolled in those classes.`,
          );
        } else {
          this.showSuccess('Fee structure created!');
        }

        this.loadStudentFeedingFees();
        this.loadStats();
      }

      this.savingStructure = false;
      this.showStructureModal = false;
      this.loadFeeStructures();
      this.cdr.markForCheck();
    } catch (err: any) {
      this.savingStructure = false;
      this.errorMessage = err.message || 'Failed to save';
      this.cdr.markForCheck();
    }
  }

  private async syncStudentFeesAfterEdit(structureId: string): Promise<void> {
    try {
      await (this.feedingService as any).supabase.client.rpc(
        'sync_student_fees_after_structure_update',
        { p_feeding_fee_structure_id: structureId },
      );
    } catch (e) {
      console.warn('sync failed', e);
    }
  }

  confirmDeleteStructure(s: FeedingFeeStructure): void {
    this.structureToDelete = s;
    this.showDeleteStructureModal = true;
  }

  executeDeleteStructure(): void {
    if (!this.structureToDelete) return;
    this.deletingStructure = true;
    this.feedingService
      .deleteFeedingFeeStructure(this.structureToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletingStructure = false;
          this.showDeleteStructureModal = false;
          this.structureToDelete = null;
          this.showSuccess('Fee structure deleted');
          this.loadFeeStructures();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.deletingStructure = false;
          this.errorMessage = err.message || 'Failed to delete';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Assign to class ───────────────────────────────────────────

  openAssignClass(structure: FeedingFeeStructure): void {
    this.assignClassStructure = structure;
    this.assignClassId = ''; // always blank so admin consciously picks
    this.showAssignClassModal = true;
  }

  executeAssignClass(): void {
    if (!this.assignClassStructure || !this.assignClassId) return;
    this.assigningClass = true;

    this.feedingService
      .assignFeedingFeeToClass(
        this.assignClassStructure.id,
        this.assignClassId,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.assigningClass = false;
          this.showAssignClassModal = false;
          const className =
            this.classes.find((c) => c.id === this.assignClassId)?.name ||
            'class';
          this.showSuccess(
            `Feeding fee assigned to all students in ${className}!`,
          );
          this.loadStudentFeedingFees();
          this.loadStats();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.assigningClass = false;
          this.errorMessage = err.message || 'Failed to assign fee to class';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Assign to individual student ──────────────────────────────

  openAssignStudent(structure: FeedingFeeStructure): void {
    this.assignStudentStructure = structure;
    this.studentSearchQuery = '';
    this.studentSearchResults = [];
    this.selectedStudentId = '';
    this.selectedStudentName = '';
    this.assignCustomAmount = null;
    this.useCustomAmount = false;
    this.showAssignStudentModal = true;
  }

  searchStudents(): void {
    if (!this.studentSearchQuery || this.studentSearchQuery.length < 2) {
      this.studentSearchResults = [];
      return;
    }
    this.searchingStudents = true;
    this.feedingService
      .searchStudents(this.churchId, this.studentSearchQuery)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.studentSearchResults = results;
          this.searchingStudents = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.searchingStudents = false;
          this.cdr.markForCheck();
        },
      });
  }

  selectStudent(student: any): void {
    this.selectedStudentId = student.id;
    this.selectedStudentName = `${student.first_name} ${student.last_name} (${student.student_number})`;
    this.studentSearchQuery = this.selectedStudentName;
    this.studentSearchResults = [];
  }

  get assignPreviewAmount(): number {
    if (this.useCustomAmount && this.assignCustomAmount)
      return this.assignCustomAmount;
    return this.assignStudentStructure?.total_amount || 0;
  }

  executeAssignStudent(): void {
    if (!this.assignStudentStructure || !this.selectedStudentId) return;
    this.assigningStudent = true;

    const customAmt =
      this.useCustomAmount && this.assignCustomAmount
        ? this.assignCustomAmount
        : undefined;

    this.feedingService
      .assignFeedingFeeToStudent(
        this.selectedStudentId,
        this.assignStudentStructure.id,
        this.selectedYear,
        this.selectedTerm,
        customAmt,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.assigningStudent = false;
          this.showAssignStudentModal = false;
          this.showSuccess('Feeding fee assigned to student!');
          this.loadStudentFeedingFees();
          this.loadStats();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.assigningStudent = false;
          this.errorMessage = err.message || 'Failed to assign';
          this.cdr.markForCheck();
        },
      });
  }

  // ── View assigned students ────────────────────────────────────

  openAssignedStudents(structure: FeedingFeeStructure): void {
    this.assignedStudentsStructure = structure;
    this.assignedStudentsList = [];
    this.unassignError = '';
    this.showAssignedStudentsModal = true;
    this.loadingAssignedStudents = true;

    this.feedingService
      .getStudentsAssignedToFeedingFeeStructure(
        structure.id,
        this.selectedYear,
        this.selectedTerm,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (students) => {
          this.assignedStudentsList = students;
          this.loadingAssignedStudents = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loadingAssignedStudents = false;
          this.cdr.markForCheck();
        },
      });
  }

  unassignStudent(studentFeedingFeeId: string, studentName: string): void {
    this.unassigningId = studentFeedingFeeId;
    this.unassignError = '';

    this.feedingService
      .unassignStudentFeedingFee(studentFeedingFeeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.unassigningId = null;
          this.assignedStudentsList = this.assignedStudentsList.filter(
            (s) => s.studentFeedingFeeId !== studentFeedingFeeId,
          );
          this.showSuccess(`Unassigned from ${studentName}`);
          this.loadStudentFeedingFees();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.unassigningId = null;
          this.unassignError = err.message || 'Failed to unassign';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Student Fees list ─────────────────────────────────────────

  loadStudentFeedingFees(): void {
    this.loadingStudentFees = true;
    const obs$ = this.showOutstandingOnly
      ? this.feedingService.getOutstandingStudentFeedingFees(
          this.selectedYear,
          this.selectedTerm,
          this.selectedClassFilter || undefined,
        )
      : this.feedingService.getAllStudentFeedingFees(
          this.selectedYear,
          this.selectedTerm,
        );

    obs$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (fees) => {
        let result = fees;
        if (this.selectedClassFilter && !this.showOutstandingOnly) {
          result = fees.filter(
            (f: any) =>
              f.student?.class?.id === this.selectedClassFilter ||
              (f.student as any)?.class_id === this.selectedClassFilter,
          );
        }
        this.studentFeedingFees = result;
        this.loadingStudentFees = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = err.message;
        this.loadingStudentFees = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Student detail ────────────────────────────────────────────

  async openStudentDetail(fee: StudentFeedingFee): Promise<void> {
    const studentId = fee.student_id || (fee as any).student?.id;
    if (!studentId) return;
    this.studentDetailLoading = true;
    this.showStudentDetailModal = true;
    this.studentDetail = null;
    this.cdr.markForCheck();
    try {
      this.studentDetail = await this.feedingService.getStudentTermDetail(
        this.churchId,
        studentId,
        this.selectedYear,
        this.selectedTerm,
      );
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load';
    } finally {
      this.studentDetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  async openStudentDetailFromPayment(payment: any): Promise<void> {
    if (!payment?.student?.id) return;
    this.studentDetailLoading = true;
    this.showStudentDetailModal = true;
    this.studentDetail = null;
    this.cdr.markForCheck();
    try {
      this.studentDetail = await this.feedingService.getStudentTermDetail(
        this.churchId,
        payment.student.id,
        this.selectedYear,
        this.selectedTerm,
      );
    } catch (err: any) {
      this.errorMessage = err.message || 'Failed to load';
    } finally {
      this.studentDetailLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ── Payments ──────────────────────────────────────────────────

  loadPayments(): void {
    this.loadingPayments = true;
    this.feedingService
      .getAllPayments(
        this.selectedYear,
        this.selectedTerm,
        this.selectedDate || undefined,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (p) => {
          this.payments = p as any;
          this.loadingPayments = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingPayments = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadDailySummary(): void {
    if (!this.selectedDate) return;
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

  loadStats(): void {
    this.feedingService
      .getFeedingStatistics(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.stats = s;
          this.cdr.markForCheck();
        },
      });
  }

  openEditPayment(payment: any): void {
    this.editingPayment = payment;
    this.editPaymentAmount = Number(payment.amount_paid);
    this.editPaymentDate = payment.payment_date;
    this.editPaymentNotes = payment.notes || '';
    this.editPaymentMethod = payment.payment_method || 'Cash';
    this.showEditPaymentModal = true;
  }

  savePaymentEdit(): void {
    if (
      !this.editingPayment ||
      !this.editPaymentAmount ||
      this.editPaymentAmount <= 0
    )
      return;
    this.savingPayment = true;

    this.feedingService
      .updateFeedingPayment(this.editingPayment.id, {
        amount_paid: this.editPaymentAmount,
        days_covered: this.editingPayment.days_covered,
        payment_date: this.editPaymentDate,
        payment_method: this.editPaymentMethod,
        notes: this.editPaymentNotes || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.savingPayment = false;
          this.showEditPaymentModal = false;
          this.showSuccess('Payment updated');
          this.loadPayments();
          this.loadStudentFeedingFees();
          this.loadStats();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.savingPayment = false;
          this.errorMessage = err.message || 'Failed to update';
          this.cdr.markForCheck();
        },
      });
  }

  deletePayment(payment: any): void {
    if (
      !confirm(
        `Delete payment of ${this.formatCurrency(payment.amount_paid)}? This cannot be undone.`,
      )
    )
      return;
    this.feedingService
      .deleteFeedingPayment(payment.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.payments = this.payments.filter((p: any) => p.id !== payment.id);
          this.showSuccess('Payment deleted');
          this.loadStudentFeedingFees();
          this.loadStats();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to delete';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Recording window ──────────────────────────────────────────

  loadActiveWindow(): void {
    this.feedingService
      .getActiveRecordingWindow(this.churchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (w) => {
          this.activeWindow = w;
          this.cdr.markForCheck();
        },
      });
  }

  openWindowModal(): void {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    this.windowFrom = this.activeWindow?.allow_from || fmt(yesterday);
    this.windowTo = this.activeWindow?.allow_to || fmt(today);
    this.windowReason = this.activeWindow?.reason || '';
    this.showWindowModal = true;
  }

  saveWindow(): void {
    if (!this.windowFrom || !this.windowTo) return;
    if (this.windowFrom > this.windowTo) {
      this.errorMessage = '"Allow From" must be before "Allow To"';
      return;
    }
    this.savingWindow = true;

    const createNew = () => {
      this.feedingService
        .createRecordingWindow(
          this.churchId,
          this.windowFrom,
          this.windowTo,
          this.windowReason,
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (w) => {
            this.activeWindow = w;
            this.savingWindow = false;
            this.showWindowModal = false;
            this.showSuccess(
              `Window: ${this.formatDateShort(w.allow_from)} – ${this.formatDateShort(w.allow_to)}`,
            );
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.savingWindow = false;
            this.errorMessage = err.message || 'Failed to save window';
            this.cdr.markForCheck();
          },
        });
    };

    if (this.activeWindow?.id) {
      this.feedingService
        .deactivateRecordingWindow(this.activeWindow.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => createNew(),
          error: (err) => {
            this.savingWindow = false;
            this.errorMessage = err.message;
            this.cdr.markForCheck();
          },
        });
    } else {
      createNew();
    }
  }

  deactivateWindow(): void {
    if (!this.activeWindow?.id) return;
    if (!confirm('Close this recording window?')) return;
    this.feedingService
      .deactivateRecordingWindow(this.activeWindow.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.activeWindow = null;
          this.showSuccess('Recording window closed');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.cdr.markForCheck();
        },
      });
  }

  loadWindowHistory(): void {
    this.feedingService
      .getAllRecordingWindows(this.churchId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (windows) => {
          this.windowHistory = windows;
          this.showWindowHistory = true;
          this.cdr.markForCheck();
        },
      });
  }

  isWindowActive(): boolean {
    if (!this.activeWindow) return false;
    const today = new Date().toISOString().split('T')[0];
    return (
      this.activeWindow.allow_from <= today &&
      this.activeWindow.allow_to >= today
    );
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.publicLink).then(() => {
      this.linkCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.linkCopied = false;
        this.cdr.markForCheck();
      }, 2500);
    });
  }

  getStudentName(student: any): string {
    if (!student) return '—';
    return `${student.first_name || ''} ${student.last_name || ''}`.trim();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }

  formatDateShort(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GH', {
      month: 'short',
      day: 'numeric',
    });
  }

  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  get collectionRate(): number {
    if (!this.stats || this.stats.total_due === 0) return 0;
    return Math.round((this.stats.total_paid / this.stats.total_due) * 100);
  }

  get totalCollectedToday(): number {
    return this.payments.reduce(
      (s: number, p: any) => s + Number(p.amount_paid),
      0,
    );
  }

  trackById(_: number, item: any): string {
    return item.id;
  }

  private showSuccess(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => {
      this.successMessage = '';
      this.cdr.markForCheck();
    }, 3500);
  }
}


