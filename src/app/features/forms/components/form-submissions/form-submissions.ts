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



<!-- src/app/features/forms/components/form-submissions/form-submissions.component.html -->
<div class="dashboard-layout">
  <app-sidebar></app-sidebar>

  <div class="dashboard-content">
    <app-header></app-header>

    <div class="dashboard-body">
      <div class="submissions-container">
        <!-- Page Header -->
        <div class="page-header">
          <div class="header-left">
            <button class="back-btn" (click)="goBack()">
              <i class="ri-arrow-left-line"></i>
            </button>
            <div>
              <h1>Form Submissions</h1>
              <p class="subtitle" *ngIf="formTemplate">{{ formTemplate.title }}</p>
            </div>
          </div>
          <div class="header-actions">
            <button
              class="btn-secondary"
              (click)="exportToCSV()"
              [disabled]="submissions.length === 0 || !canManageForms"
              [title]="canManageForms ? 'Export to CSV' : 'No permission'"
            >
              <i class="ri-download-line"></i>
              Export CSV
            </button>
            <button class="btn-primary" (click)="fillForm()">
              <i class="ri-add-line"></i>
              New Submission
            </button>
          </div>
        </div>

        <!-- Success/Error Messages -->
        <div *ngIf="successMessage" class="success-alert">
          <i class="ri-checkbox-circle-line"></i>
          <span>{{ successMessage }}</span>
        </div>

        <div *ngIf="errorMessage" class="error-alert">
          <i class="ri-error-warning-line"></i>
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Stats -->
        <div class="stats-row" *ngIf="!loadingForm">
          <div class="stat-card">
            <div class="stat-icon">
              <i class="ri-file-list-3-line"></i>
            </div>
            <div class="stat-info">
              <p class="stat-label">Total Submissions</p>
              <h3 class="stat-value">{{ totalSubmissions }}</h3>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: #DBEAFE; color: #2563EB;">
              <i class="ri-calendar-line"></i>
            </div>
            <div class="stat-info">
              <p class="stat-label">This Month</p>
              <h3 class="stat-value">{{ pendingSubmissionsCount }}</h3>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon" style="background: #D1FAE5; color: #10B981;">
              <i class="ri-checkbox-circle-line"></i>
            </div>
            <div class="stat-info">
              <p class="stat-label">Form Active</p>
              <h3 class="stat-value">{{ formTemplate?.is_active ? 'Yes' : 'No' }}</h3>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" class="loading-container">
          <app-loading-spinner message="Loading submissions..."></app-loading-spinner>
        </div>

        <!-- Submissions List -->
        <div *ngIf="!loading" class="submissions-list">
          <div *ngFor="let submission of submissions" class="submission-card" (click)="viewSubmission(submission)">
            <div class="card-header">
              <div class="submission-info">
                <h3>{{ getMemberName(submission) }}</h3>
                <p class="submission-date">
                  {{ submission.submitted_at | date:'MMM d, y h:mm a' }}
                </p>
              </div>
              <div class="card-actions">
                <button
                  class="btn-icon-small btn-danger"
                  (click)="deleteSubmission(submission.id, $event)"
                  [disabled]="!canManageForms"
                  [title]="canManageForms ? 'Delete submission' : 'No permission'"
                >
                  <i class="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>

            <div class="card-body">
              <p class="submission-preview">{{ getSubmissionPreview(submission) }}</p>
            </div>

            <div class="card-footer">
              <span class="ip-info" *ngIf="submission.ip_address">
                <i class="ri-earth-line"></i>
                {{ submission.ip_address }}
              </span>
            </div>
          </div>

          <!-- Empty State -->
          <div *ngIf="submissions.length === 0" class="empty-state">
            <i class="ri-file-list-3-line"></i>
            <h3>No Submissions Yet</h3>
            <p>No one has filled out this form yet</p>
            <button class="btn-primary" (click)="fillForm()">
              <i class="ri-add-line"></i>
              Create First Submission
            </button>
          </div>
        </div>

        <!-- Pagination -->
        <div class="pagination" *ngIf="totalPages > 1 && !loading">
          <button class="pagination-btn" [disabled]="currentPage === 1" (click)="previousPage()">
            <i class="ri-arrow-left-s-line"></i>
            Previous
          </button>

          <div class="pagination-pages">
            <span class="page-info">
              Page {{ currentPage }} of {{ totalPages }} ({{ totalSubmissions }} submissions)
            </span>
          </div>

          <button class="pagination-btn" [disabled]="currentPage === totalPages" (click)="nextPage()">
            Next
            <i class="ri-arrow-right-s-line"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Submission Detail Modal -->
<div class="modal-overlay" *ngIf="showSubmissionModal" (click)="closeSubmissionModal()">
  <div class="modal-content" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <h2>Submission Details</h2>
      <button class="close-btn" (click)="closeSubmissionModal()">
        <i class="ri-close-line"></i>
      </button>
    </div>

    <div class="modal-body" *ngIf="selectedSubmission">
      <div class="submission-meta">
        <div class="meta-item">
          <span class="meta-label">Submitted By:</span>
          <span class="meta-value">{{ getMemberName(selectedSubmission) }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Submitted At:</span>
          <span class="meta-value">{{ selectedSubmission.submitted_at | date:'full' }}</span>
        </div>
        <div class="meta-item" *ngIf="selectedSubmission.ip_address">
          <span class="meta-label">IP Address:</span>
          <span class="meta-value">{{ selectedSubmission.ip_address }}</span>
        </div>
      </div>

      <div class="submission-data">
        <h3>Response Data</h3>
        <div class="data-grid">
          <div *ngFor="let item of selectedSubmission.submission_data | keyvalue" class="data-item">
            <span class="data-label">{{ item.key }}</span>
            <span class="data-value">
              {{ isArray(item.value) ? item.value.join(', ') : item.value }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-secondary" (click)="closeSubmissionModal()">
        Close
      </button>
    </div>
  </div>
</div>
