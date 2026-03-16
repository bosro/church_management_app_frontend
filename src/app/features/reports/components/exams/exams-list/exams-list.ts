
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Exam, SchoolClass, TERMS } from '../../../../../models/school.model';

@Component({
  selector: 'app-exams-list',
  standalone: false,
  templateUrl: './exams-list.html',
  styleUrl: './exams-list.scss',
})
export class ExamsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  exams: Exam[] = [];
  classes: SchoolClass[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

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
    this.loadExams();
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

  loadExams(): void {
    this.loading = true;
    this.errorMessage = '';

    this.schoolService
      .getExams({
        academicYear: this.selectedYear,
        term: this.selectedTerm,
        classId: this.selectedClassId || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (exams) => {
          this.exams = exams;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load exams';
          this.loading = false;
        },
      });
  }

  onFilterChange(): void {
    this.loadExams();
  }

  createExam(): void {
    this.router.navigate(['main/reports/exams/create']);
  }

  enterResults(examId: string): void {
    this.router.navigate(['main/reports/exams', examId, 'results']);
  }

  viewClassResults(exam: Exam): void {
    this.router.navigate(['main/reports/exams', exam.id, 'results']);
  }
}
