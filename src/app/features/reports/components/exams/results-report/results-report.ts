import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchoolService } from '../../../services/school.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { AuthService } from '../../../../../core/services/auth';
import { SupabaseService } from '../../../../../core/services/supabase';
import { StudentReportCard } from '../../../../../models/school.model';

@Component({
  selector: 'app-results-report',
  standalone: false,
  templateUrl: './results-report.html',
  styleUrl: './results-report.scss',
})
export class ResultsReport implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  examId = '';
  studentId = '';
  reportCard: StudentReportCard | null = null;
  churchName = '';
  churchLogo = '';
  loading = true;
  errorMessage = '';
  showPosition = true;

  constructor(
    private schoolService: SchoolService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') || '';
    this.studentId = this.route.snapshot.paramMap.get('studentId') || '';
    this.loadChurchInfo();
    this.loadReportCard();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadChurchInfo(): void {
    const churchId = this.authService.getChurchId();
    if (!churchId) return;

    this.supabase.client
      .from('churches')
      .select('name, logo_url')
      .eq('id', churchId)
      .single()
      .then(({ data }) => {
        if (data) {
          this.churchName = data.name || '';
          this.churchLogo = data.logo_url || '';
        }
      });
  }

  loadReportCard(): void {
    this.loading = true;
    this.schoolService
      .getStudentReportCard(this.studentId, this.examId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (report) => {
          this.reportCard = report;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to load report card';
          this.loading = false;
        },
      });
  }

  printReport(): void {
    window.print();
  }

  goBack(): void {
    this.router.navigate(['main/reports/exams', this.examId, 'results']);
  }

  getStudentFullName(): string {
    const s = this.reportCard?.student;
    if (!s) return '';
    return `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.trim();
  }

  getOrdinal(n: number): string {
    return this.schoolService.getOrdinal(n);
  }

  getGradeLabel(grade: string): string {
    const scale = this.reportCard?.results[0];
    return grade || '—';
  }

  getScoreClass(score: number | undefined): string {
    if (!score) return '';
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-average';
    return 'score-fail';
  }

  formatCurrency(n: number): string {
    return n.toFixed(1);
  }
}
