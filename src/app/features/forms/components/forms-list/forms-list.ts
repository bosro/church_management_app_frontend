// src/app/features/forms/components/forms-list/forms-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

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
    private router: Router,
    public permissionService: PermissionService,
    private authService: AuthService,
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
    const role = this.authService.getCurrentUserRole();

    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
    ];

    this.canManageForms =
      this.permissionService.isAdmin ||
      (this.permissionService.forms as any)?.manage ||
      this.formsService.canManageForms() || // keep for backwards compat
      manageRoles.includes(role);

    // NOTE: No redirect here — all authenticated users can VIEW the forms list.
    // The routing guard (PermissionGuard) already blocked unauthenticated access.
  }

  loadFormTemplates(): void {
    this.loading = true;
    this.errorMessage = '';

    this.formsService
      .getFormTemplates(this.currentPage, this.pageSize)
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
        },
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

    const confirmMessage =
      'Are you sure you want to delete this form template? All submissions will remain but the form will be archived.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.formsService
      .deleteFormTemplate(formId)
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
        },
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
