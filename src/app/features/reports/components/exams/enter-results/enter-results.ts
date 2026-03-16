
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import {
  Exam, Student, Subject as SchoolSubject,
  ExamResult, GradingScale
} from '../../../../../models/school.model';

interface ResultRow {
  student: Student;
  scores: { [subjectId: string]: number | null };
  total: number;
  average: number;
}

@Component({
  selector: 'app-enter-results',
  standalone: false,
  templateUrl: './enter-results.html',
  styleUrl: './enter-results.scss',
})
export class EnterResults implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  examId = '';
  exam: Exam | null = null;
  students: Student[] = [];
  subjects: SchoolSubject[] = [];
  gradingScale: GradingScale[] = [];
  existingResults: ExamResult[] = [];
  resultRows: ResultRow[] = [];

  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    public router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (!this.permissionService.school.exams) {
      this.router.navigate(['/unauthorized']);
      return;
    }
    this.examId = this.route.snapshot.paramMap.get('id') || '';
    this.loadExamData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadExamData(): void {
    this.loading = true;

    // Load exam details
    this.schoolService
      .getExams()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (exams) => {
          this.exam = exams.find((e) => e.id === this.examId) || null;
          if (!this.exam) {
            this.errorMessage = 'Exam not found';
            this.loading = false;
            return;
          }
          this.loadSubjectsAndStudents();
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.loading = false;
        },
      });
  }

  private loadSubjectsAndStudents(): void {
    if (!this.exam) return;

    Promise.all([
      this.schoolService.getSubjects(this.exam.class_id).toPromise(),
      this.schoolService.getStudents(
        { classId: this.exam.class_id, isActive: true }, 1, 200
      ).toPromise(),
      this.schoolService.getExamResults(this.examId).toPromise(),
      this.schoolService.getGradingScale().toPromise(),
    ]).then(([subjects, studentsResult, results, scale]) => {
      this.subjects = subjects || [];
      this.students = studentsResult?.data || [];
      this.existingResults = results || [];
      this.gradingScale = scale || [];
      this.buildResultRows();
      this.loading = false;
    }).catch((err) => {
      this.errorMessage = err.message || 'Failed to load data';
      this.loading = false;
    });
  }

  private buildResultRows(): void {
    this.resultRows = this.students.map((student) => {
      const scores: { [subjectId: string]: number | null } = {};

      this.subjects.forEach((subject) => {
        const existing = this.existingResults.find(
          (r) => r.student_id === student.id && r.subject_id === subject.id,
        );
        scores[subject.id] = existing?.marks_obtained ?? null;
      });

      const validScores = Object.values(scores).filter(
        (s): s is number => s !== null,
      );
      const total = validScores.reduce((s, n) => s + n, 0);
      const average = validScores.length > 0 ? total / validScores.length : 0;

      return { student, scores, total, average };
    });
  }

  updateTotals(row: ResultRow): void {
    const validScores = Object.values(row.scores).filter(
      (s): s is number => s !== null && !isNaN(s),
    );
    row.total = validScores.reduce((s, n) => s + n, 0);
    row.average = validScores.length > 0 ? row.total / validScores.length : 0;
  }

  getGrade(score: number | null): string {
    if (score === null || score === undefined) return '—';
    return this.schoolService.getGradeFromScore(score, this.gradingScale);
  }

  saveResults(): void {
    this.saving = true;
    this.errorMessage = '';

    const results: Partial<ExamResult>[] = [];

    this.resultRows.forEach((row) => {
      this.subjects.forEach((subject) => {
        const score = row.scores[subject.id];
        if (score !== null && score !== undefined) {
          results.push({
            student_id: row.student.id,
            exam_id: this.examId,
            subject_id: subject.id,
            marks_obtained: Number(score),
            grade: this.getGrade(score),
          });
        }
      });
    });

    this.schoolService
      .upsertExamResults(results)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Results saved successfully!';
          this.saving = false;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to save results';
          this.saving = false;
        },
      });
  }

  viewReportCard(studentId: string): void {
    this.router.navigate([
      'main/reports/exams', this.examId,
      'students', studentId, 'report',
    ]);
  }

  goBack(): void {
    this.router.navigate(['main/reports/exams']);
  }

  getStudentName(student: Student): string {
    return `${student.first_name} ${student.last_name}`;
  }
}
