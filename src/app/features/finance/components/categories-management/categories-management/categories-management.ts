// src/app/features/finance/components/categories-management/categories-management.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GivingCategory } from '../../../../../models/giving.model';
import { FinanceService } from '../../../services/finance.service';

@Component({
  selector: 'app-categories-management',
  standalone: false,
  templateUrl: './categories-management.html',
  styleUrl: './categories-management.scss',
})
export class CategoriesManagement implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  categories: GivingCategory[] = [];
  loading = false;
  submitting = false;
  errorMessage = '';
  successMessage = '';

  // Form for adding/editing categories
  showForm = false;
  categoryForm!: FormGroup;
  editingCategory: GivingCategory | null = null;

  // Permissions
  canManageCategories = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageCategories = this.financeService.canManageCategories();
  }

  private initForm(): void {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      description: ['', [Validators.maxLength(200)]]
    });
  }

  loadCategories(): void {
    this.loading = true;
    this.errorMessage = '';

    this.financeService.getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load categories';
          this.loading = false;
          console.error('Error loading categories:', error);
        }
      });
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.cancelEdit();
    }
    this.clearMessages();
  }

  editCategory(category: GivingCategory): void {
    if (!this.canManageCategories) {
      this.errorMessage = 'You do not have permission to edit categories';
      return;
    }

    this.editingCategory = category;
    this.showForm = true;
    this.categoryForm.patchValue({
      name: category.name,
      description: category.description || ''
    });
    this.clearMessages();
  }

  cancelEdit(): void {
    this.editingCategory = null;
    this.categoryForm.reset();
    this.clearMessages();
  }

  onSubmit(): void {
    if (!this.canManageCategories) {
      this.errorMessage = 'You do not have permission to manage categories';
      return;
    }

    if (this.categoryForm.invalid) {
      this.markFormGroupTouched(this.categoryForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const categoryData = {
      name: this.categoryForm.value.name.trim(),
      description: this.categoryForm.value.description?.trim() || undefined
    };

    if (this.editingCategory) {
      // Update existing category
      this.financeService.updateGivingCategory(this.editingCategory.id, categoryData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Category updated successfully!';
            this.loadCategories();
            this.toggleForm();
            this.submitting = false;

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to update category';
            this.submitting = false;
            console.error('Error updating category:', error);
          }
        });
    } else {
      // Create new category
      this.financeService.createGivingCategory(categoryData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Category created successfully!';
            this.loadCategories();
            this.toggleForm();
            this.submitting = false;

            setTimeout(() => {
              this.successMessage = '';
            }, 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to create category';
            this.submitting = false;
            console.error('Error creating category:', error);
          }
        });
    }
  }

  deleteCategory(categoryId: string): void {
    if (!this.canManageCategories) {
      this.errorMessage = 'You do not have permission to delete categories';
      return;
    }

    const confirmMessage = 'Are you sure you want to delete this category? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.financeService.deleteGivingCategory(categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Category deleted successfully!';
          this.loadCategories();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete category';
          console.error('Error deleting category:', error);
        }
      });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
