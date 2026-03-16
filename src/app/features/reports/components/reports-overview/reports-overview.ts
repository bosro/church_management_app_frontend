
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../services/school.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { TERMS } from '../../../../models/school.model';

@Component({
  selector: 'app-reports-overview',
  standalone: false,
  templateUrl: './reports-overview.html',
  styleUrl: './reports-overview.scss',
})
export class ReportsOverview implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  statistics: any = null;
  loading = true;
  errorMessage = '';

  currentAcademicYear = '';
  currentTerm = TERMS[0];
  terms = TERMS;
  academicYears: string[] = [];

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    this.initAcademicYear();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initAcademicYear(): void {
    const year = new Date().getFullYear();
    this.currentAcademicYear = `${year}/${year + 1}`;
    // Generate last 3 years
    this.academicYears = [
      `${year}/${year + 1}`,
      `${year - 1}/${year}`,
      `${year - 2}/${year - 1}`,
    ];
  }

  loadStatistics(): void {
    this.loading = true;
    this.schoolService
      .getSchoolStatistics(this.currentAcademicYear, this.currentTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load statistics';
          this.loading = false;
        },
      });
  }

  onTermChange(): void {
    this.loadStatistics();
  }

  onYearChange(): void {
    this.loadStatistics();
  }

  // Navigation
  goToStudents(): void {
    this.router.navigate(['main/reports/students']);
  }

  goToClasses(): void {
    this.router.navigate(['main/reports/classes']);
  }

  goToFeeStructures(): void {
    this.router.navigate(['main/reports/fees/structures']);
  }

  goToStudentFees(): void {
    this.router.navigate(['main/reports/fees/students']);
  }

  goToFeeReport(): void {
    this.router.navigate(['main/reports/fees/report']);
  }

  goToExams(): void {
    this.router.navigate(['main/reports/exams']);
  }

  goToGrading(): void {
    this.router.navigate(['main/reports/settings/grading']);
  }

  goToSubjects(): void {
    this.router.navigate(['main/reports/settings/subjects']);
  }

  getCollectionRate(): number {
    if (!this.statistics || this.statistics.total_fees_due === 0) return 0;
    return Math.round(
      (this.statistics.total_fees_paid / this.statistics.total_fees_due) * 100,
    );
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount || 0);
  }
}
