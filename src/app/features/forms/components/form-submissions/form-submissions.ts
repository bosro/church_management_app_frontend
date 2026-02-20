// src/app/features/forms/components/form-submissions/form-submissions.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate, FormSubmission } from '../../../../models/form.model';
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

  // Permissions
  canManageForms = false;

  constructor(
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
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

  private checkPermissions(): void {
    this.canManageForms = this.formsService.canManageForms();
  }

  private loadFormTemplate(): void {
    this.loadingForm = true;

    this.formsService.getFormTemplateById(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          this.formTemplate = template;
          this.loadingForm = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load form template';
          this.loadingForm = false;
          console.error('Error loading form template:', error);
        }
      });
  }

  loadSubmissions(): void {
    this.loading = true;
    this.errorMessage = '';

    this.formsService.getFormSubmissions(this.formId, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.submissions = data;
          this.totalSubmissions = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load submissions';
          this.loading = false;
          console.error('Error loading submissions:', error);
        }
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/forms']);
  }

  fillForm(): void {
    this.router.navigate(['main/forms', this.formId, 'fill']);
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

  // Note: Status updates removed since not in DB
  // If you need status, consider adding a metadata JSONB column

  get pendingSubmissionsCount(): number {
    // All submissions are considered "pending" since status isn't in DB
    return this.submissions.length;
  }

  get approvedSubmissionsCount(): number {
    return 0; // Not tracked in current schema
  }

  // Delete Submission
  deleteSubmission(submissionId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageForms) {
      this.errorMessage = 'You do not have permission to delete submissions';
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this submission? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.formsService.deleteSubmission(submissionId)
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
          console.error('Error deleting submission:', error);
        }
      });
  }

  // Export
  exportToCSV(): void {
    if (!this.canManageForms) {
      this.errorMessage = 'You do not have permission to export submissions';
      return;
    }

    this.formsService.exportSubmissions(this.formId)
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
          console.error('Export error:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadSubmissions();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadSubmissions();
      this.scrollToTop();
    }
  }

  // Helper Methods
  getMemberName(submission: FormSubmission): string {
    if (submission.member) {
      return `${submission.member.first_name} ${submission.member.last_name}`;
    }
    return 'Guest';
  }

  getSubmissionPreview(submission: FormSubmission): string {
    const values = Object.values(submission.submission_data);
    const preview = values.slice(0, 2).map(v => {
      if (Array.isArray(v)) {
        return v.join(', ');
      }
      return String(v);
    }).join(' • ');

    return preview + (values.length > 2 ? '...' : '');
  }

  isArray(value: any): value is any[] {
    return Array.isArray(value);
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
