
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

  constructor(
    private formsService: FormsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFormTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFormTemplates(): void {
    this.loading = true;

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
          console.error('Error loading forms:', error);
          this.loading = false;
        }
      });
  }

  // Navigation
  createForm(): void {
    this.router.navigate(['/forms/create']);
  }

  editForm(formId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/forms', formId, 'edit']);
  }

  viewSubmissions(formId: string): void {
    this.router.navigate(['/forms', formId, 'submissions']);
  }

  fillForm(formId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/forms', formId, 'fill']);
  }

  deleteForm(formId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this form template?')) {
      this.formsService.deleteFormTemplate(formId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Form deleted successfully!';
            this.loadFormTemplates();

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete form';
          }
        });
    }
  }

  // Pagination
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadFormTemplates();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadFormTemplates();
    }
  }
}
