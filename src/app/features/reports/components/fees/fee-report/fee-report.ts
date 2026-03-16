
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass, TERMS } from '../../../../../models/school.model';

@Component({
  selector: 'app-fee-report',
  standalone: false,
  templateUrl: './fee-report.html',
  styleUrl: './fee-report.scss',
})
export class FeeReport implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  outstandingFees: any[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';

  selectedTerm = TERMS[0];
  selectedYear = '';
  selectedClassId = '';
  terms = TERMS;
  academicYears: string[] = [];

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    const year = new Date().getFullYear();
    this.selectedYear = `${year}/${year + 1}`;
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
    ];
    this.loadClasses();
    this.loadReport();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClasses(): void {
    this.schoolService.getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (c) => (this.classes = c) });
  }

  loadReport(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getOutstandingFees(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          this.outstandingFees = this.selectedClassId
            ? fees.filter((f) => f.student?.class_id === this.selectedClassId)
            : fees;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load report';
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.loadReport();
  }

  // Group by student
  get studentSummaries(): any[] {
    const map: { [key: string]: any } = {};

    this.outstandingFees.forEach((fee) => {
      const sid = fee.student_id;
      if (!map[sid]) {
        map[sid] = {
          student: fee.student,
          fees: [],
          totalDue: 0,
          totalPaid: 0,
          totalBalance: 0,
        };
      }
      map[sid].fees.push(fee);
      map[sid].totalDue += Number(fee.amount_due);
      map[sid].totalPaid += Number(fee.amount_paid);
      map[sid].totalBalance += Number(fee.amount_due) - Number(fee.amount_paid);
    });

    return Object.values(map).sort(
      (a, b) => b.totalBalance - a.totalBalance,
    );
  }

  get grandTotalDue(): number {
    return this.studentSummaries.reduce((s, r) => s + r.totalDue, 0);
  }

  get grandTotalPaid(): number {
    return this.studentSummaries.reduce((s, r) => s + r.totalPaid, 0);
  }

  get grandTotalBalance(): number {
    return this.studentSummaries.reduce((s, r) => s + r.totalBalance, 0);
  }

  viewStudent(studentId: string): void {
    this.router.navigate(['main/reports/students', studentId]);
  }

  recordPayment(studentId: string): void {
    this.router.navigate(['main/reports/fees/record', studentId]);
  }

  printReport(): void {
    window.print();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }

  getStudentName(student: any): string {
    if (!student) return '—';
    return `${student.first_name} ${student.last_name}`;
  }
}
