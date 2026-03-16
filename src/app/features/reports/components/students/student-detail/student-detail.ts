
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  Student, StudentFee, FeePayment, TERMS
} from '../../../../../models/school.model';

@Component({
  selector: 'app-student-detail',
  standalone: false,
  templateUrl: './student-detail.html',
  styleUrl: './student-detail.scss',
})
export class StudentDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  student: Student | null = null;
  fees: StudentFee[] = [];
  payments: FeePayment[] = [];
  loading = true;
  errorMessage = '';
  successMessage = '';

  activeTab: 'overview' | 'fees' | 'payments' = 'overview';

  currentAcademicYear = '';
  currentTerm = TERMS[0];
  terms = TERMS;
  academicYears: string[] = [];

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.studentId = this.route.snapshot.paramMap.get('id') || '';
    const year = new Date().getFullYear();
    this.currentAcademicYear = `${year}/${year + 1}`;
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
    ];
    this.loadStudent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStudent(): void {
    this.loading = true;
    this.schoolService
      .getStudentById(this.studentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (student) => {
          this.student = student;
          this.loading = false;
          this.loadFees();
          this.loadPayments();
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load student';
          this.loading = false;
        },
      });
  }

  loadFees(): void {
    this.schoolService
      .getStudentFees(this.studentId, this.currentAcademicYear, this.currentTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => (this.fees = fees),
        error: (err) => console.error(err),
      });
  }

  loadPayments(): void {
    this.schoolService
      .getPayments(
        { studentId: this.studentId,
          academicYear: this.currentAcademicYear,
          term: this.currentTerm },
        1, 50
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => (this.payments = data),
        error: (err) => console.error(err),
      });
  }

  onTermChange(): void {
    this.loadFees();
    this.loadPayments();
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/reports/students']);
  }

  editStudent(): void {
    this.router.navigate(['main/reports/students', this.studentId, 'edit']);
  }

  recordPayment(): void {
    this.router.navigate(['main/reports/fees/record', this.studentId]);
  }

  viewReceipt(receiptNumber: string): void {
    this.router.navigate(['main/reports/receipts', receiptNumber]);
  }

  // Helpers
  getFullName(): string {
    if (!this.student) return '';
    return `${this.student.first_name} ${this.student.middle_name || ''} ${this.student.last_name}`.trim();
  }

  getInitials(): string {
    if (!this.student) return '';
    return `${this.student.first_name[0]}${this.student.last_name[0]}`.toUpperCase();
  }

  getTotalDue(): number {
    return this.fees.reduce((s, f) => s + f.amount_due, 0);
  }

  getTotalPaid(): number {
    return this.fees.reduce((s, f) => s + f.amount_paid, 0);
  }

  getTotalBalance(): number {
    return this.getTotalDue() - this.getTotalPaid();
  }

  getFeeStatusClass(status: string): string {
    const map: Record<string, string> = {
      paid: 'status-paid',
      partial: 'status-partial',
      unpaid: 'status-unpaid',
    };
    return map[status] || '';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }

  calculateAge(dob?: string): number | null {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() &&
         today.getDate() < birth.getDate())) age--;
    return age;
  }
}
