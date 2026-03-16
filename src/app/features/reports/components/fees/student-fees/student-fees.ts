
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { SchoolClass, TERMS } from '../../../../../models/school.model';

@Component({
  selector: 'app-student-fees',
  standalone: false,
  templateUrl: './student-fees.html',
  styleUrl: './student-fees.scss',
})
export class StudentFees implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentSummaries: any[] = [];
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
    this.loadFees();
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

  loadFees(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getOutstandingFees(this.selectedYear, this.selectedTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (fees) => {
          const filtered = this.selectedClassId
            ? fees.filter((f: any) => f.student?.class_id === this.selectedClassId)
            : fees;

          // Group by student
          const map: { [key: string]: any } = {};
          filtered.forEach((fee: any) => {
            const sid = fee.student_id;
            if (!map[sid]) {
              map[sid] = {
                student: fee.student,
                totalDue: 0,
                totalPaid: 0,
                totalBalance: 0,
                status: 'paid',
              };
            }
            map[sid].totalDue += Number(fee.amount_due);
            map[sid].totalPaid += Number(fee.amount_paid);
            map[sid].totalBalance += Number(fee.amount_due) - Number(fee.amount_paid);

            if (fee.status === 'unpaid') map[sid].status = 'unpaid';
            else if (fee.status === 'partial' && map[sid].status !== 'unpaid')
              map[sid].status = 'partial';
          });

          this.studentSummaries = Object.values(map);
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.loadFees();
  }

  viewStudent(studentId: string): void {
    this.router.navigate(['main/reports/students', studentId]);
  }

  recordPayment(studentId: string): void {
    this.router.navigate(['main/reports/fees/record', studentId]);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency', currency: 'GHS',
    }).format(amount || 0);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      paid: 'status-paid',
      partial: 'status-partial',
      unpaid: 'status-unpaid',
    };
    return map[status] || '';
  }
}
