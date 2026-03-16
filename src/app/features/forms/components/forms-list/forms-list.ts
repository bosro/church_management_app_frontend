// src/app/features/forms/components/forms-list/forms-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';

@Component({
  selector: 'app-forms-list',
  standalone: false,
  templateUrl: './forms-list.html',
  styleUrl: './forms-list.scss',
})
export class FormsList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  formTemplates: FormTemplate[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalForms = 0;
  totalPages = 0;

  // Permissions
  canManageForms = false;

  constructor(
    private formsService: FormsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.loadFormTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageForms = this.formsService.canManageForms();
  }

  loadFormTemplates(): void {
    this.loading = true;
    this.errorMessage = '';

    this.formsService.getFormTemplates(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, count }) => {
          this.formTemplates = data;
          this.totalForms = count;
          this.totalPages = Math.ceil(count / this.pageSize);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load forms';
          this.loading = false;
          console.error('Error loading forms:', error);
        }
      });
  }

  // Navigation
  createForm(): void {
    if (!this.canManageForms) {
      this.errorMessage = 'You do not have permission to create forms';
      return;
    }
    this.router.navigate(['main/forms/create']);
  }

  editForm(formId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageForms) {
      this.errorMessage = 'You do not have permission to edit forms';
      return;
    }

    this.router.navigate(['main/forms', formId, 'edit']);
  }

  viewSubmissions(formId: string): void {
    this.router.navigate(['main/forms', formId, 'submissions']);
  }

  fillForm(formId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['main/forms', formId, 'fill']);
  }

  deleteForm(formId: string, event: Event): void {
    event.stopPropagation();

    if (!this.canManageForms) {
      this.errorMessage = 'You do not have permission to delete forms';
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this form template? All submissions will remain but the form will be archived.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.formsService.deleteFormTemplate(formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form archived successfully!';
          this.loadFormTemplates();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete form';
          console.error('Error deleting form:', error);
        }
      });
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadFormTemplates();
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadFormTemplates();
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}


<!-- src/app/features/forms/components/forms-list/forms-list.component.html -->
<div class="dashboard-layout">
  <app-sidebar></app-sidebar>

  <div class="dashboard-content">
    <app-header></app-header>

    <div class="dashboard-body">
      <div class="forms-container">
        <!-- Page Header -->
        <div class="page-header">
          <div class="header-left">
            <h1>Forms</h1>
            <p class="subtitle">Create and manage custom forms</p>
          </div>
          <button class="btn-primary" (click)="createForm()" [disabled]="!canManageForms"
            [title]="canManageForms ? 'Create new form' : 'No permission'">
            <i class="ri-add-line"></i>
            <span>Create Form</span>
          </button>
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

        <!-- Loading State -->
        <div *ngIf="loading" class="loading-container">
          <app-loading-spinner message="Loading forms..."></app-loading-spinner>
        </div>

        <!-- Forms Grid -->
        <div *ngIf="!loading" class="forms-grid">
          <div *ngFor="let form of formTemplates" class="form-card" (click)="viewSubmissions(form.id)">
            <div class="card-header">
              <div class="form-icon">
                <i class="ri-file-list-3-line"></i>
              </div>
              <div class="card-actions">
                <button class="btn-icon-small" (click)="fillForm(form.id, $event)" title="Fill form">
                  <i class="ri-edit-box-line"></i>
                </button>
                <button class="btn-icon-small" (click)="editForm(form.id, $event)" [disabled]="!canManageForms"
                  [title]="canManageForms ? 'Edit form' : 'No permission'">
                  <i class="ri-settings-3-line"></i>
                </button>
                <button class="btn-icon-small btn-danger" (click)="deleteForm(form.id, $event)"
                  [disabled]="!canManageForms" [title]="canManageForms ? 'Delete form' : 'No permission'">
                  <i class="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>

            <div class="card-body">
              <h3>{{ form.title }}</h3>
              <p class="form-description" *ngIf="form.description">
                {{ form.description }}
              </p>

              <div class="form-meta">
                <span class="meta-item">
                  <i class="ri-list-check"></i>
                  {{ form.form_fields.length }} field{{ form.form_fields.length !== 1 ? 's' : '' }}
                </span>
                <span class="meta-item">
                  <i class="ri-file-text-line"></i>
                  {{ form.submission_count || 0 }} submission{{ (form.submission_count || 0) !== 1 ? 's' : '' }}
                </span>
              </div>

              <div class="form-status">
                <span class="status-badge" [class.active]="form.is_active">
                  {{ form.is_active ? 'Active' : 'Inactive' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div *ngIf="formTemplates.length === 0" class="empty-state">
            <i class="ri-file-list-3-line"></i>
            <h3>No Forms Yet</h3>
            <p>Create your first form to collect information from members</p>
            <button class="btn-primary" (click)="createForm()">
              <i class="ri-add-line"></i>
              Create Form
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
              Page {{ currentPage }} of {{ totalPages }} ({{ totalForms }} forms)
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
