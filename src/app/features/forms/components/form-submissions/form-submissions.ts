// src/app/features/forms/components/form-submissions/form-submissions.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate, FormSubmission, SubmissionStatus } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';

@Component({
  selector: 'app-form-submissions',
  standalone: false,
  templateUrl: './form-submissions.html',
  styleUrl: './form-submissions.scss',
})
export class FormSubmissions implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  formId: string = '';
  formTemplate: FormTemplate | null = null;
  submissions: FormSubmission[] = [];
  loading = false;
  loadingForm = true;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalSubmissions = 0;
  totalPages = 0;

  // View mode
  selectedSubmission: FormSubmission | null = null;
  showSubmissionModal = false;

  constructor(
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.formId = this.route.snapshot.paramMap.get('id') || '';
    if (this.formId) {
      this.loadFormTemplate();
      this.loadSubmissions();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFormTemplate(): void {
    this.loadingForm = true;

    this.formsService
      .getFormTemplateById(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          this.formTemplate = template;
          this.loadingForm = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load form template';
          this.loadingForm = false;
        },
      });
  }

  loadSubmissions(): void {
    this.loading = true;

    this.formsService
      .getFormSubmissions(this.formId, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.submissions = data;
          this.totalSubmissions = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading submissions:', error);
          this.loading = false;
        },
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/forms']);
  }

  fillForm(): void {
    this.router.navigate(['/forms', this.formId, 'fill']);
  }

  // View Submission
  viewSubmission(submission: FormSubmission): void {
    this.selectedSubmission = submission;
    this.showSubmissionModal = true;
  }

  closeSubmissionModal(): void {
    this.showSubmissionModal = false;
    this.selectedSubmission = null;
  }

  // Update Status
  updateStatus(submissionId: string, status: SubmissionStatus, event: Event): void {
    event.stopPropagation();

    this.formsService
      .updateSubmissionStatus(submissionId, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `Status updated to ${status}`;
          this.loadSubmissions();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update status';
        },
      });
  }

  get pendingSubmissionsCount(): number {
    return this.submissions.filter((s) => s.status === 'submitted').length;
  }

  get approvedSubmissionsCount(): number {
    return this.submissions.filter((s) => s.status === 'approved').length;
  }

  // Delete Submission
  deleteSubmission(submissionId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this submission?')) {
      this.formsService
        .deleteSubmission(submissionId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Submission deleted successfully!';
            this.loadSubmissions();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete submission';
          },
        });
    }
  }

  // Export
  exportToCSV(): void {
    this.formsService
      .exportSubmissions(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.formTemplate?.title || 'form'}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Submissions exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to export submissions';
        },
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSubmissions();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSubmissions();
    }
  }

  // Helper Methods
  getStatusClass(status: SubmissionStatus): string {
    const classes: Record<string, string> = {
      submitted: 'status-submitted',
      reviewed: 'status-reviewed',
      approved: 'status-approved',
      rejected: 'status-rejected',
    };
    return classes[status] || 'status-submitted';
  }

  getMemberName(submission: FormSubmission): string {
    if (submission.member) {
      return `${submission.member.first_name} ${submission.member.last_name}`;
    }
    return 'Guest';
  }

  getSubmissionPreview(submission: FormSubmission): string {
    const values = Object.values(submission.submission_data);
    return values.slice(0, 2).join(', ') + (values.length > 2 ? '...' : '');
  }

  isArray(value: any): value is any[] {
    return Array.isArray(value);
  }
}
