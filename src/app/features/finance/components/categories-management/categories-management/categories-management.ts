
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
  errorMessage = '';
  successMessage = '';

  // Form for adding/editing categories
  showForm = false;
  categoryForm!: FormGroup;
  editingCategory: GivingCategory | null = null;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['']
    });
  }

  loadCategories(): void {
    this.loading = true;

    this.financeService.getGivingCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading categories:', error);
          this.loading = false;
        }
      });
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.cancelEdit();
    }
  }

  editCategory(category: GivingCategory): void {
    this.editingCategory = category;
    this.showForm = true;
    this.categoryForm.patchValue({
      name: category.name,
      description: category.description
    });
  }

  cancelEdit(): void {
    this.editingCategory = null;
    this.categoryForm.reset();
  }

  onSubmit(): void {
    if (this.categoryForm.invalid) {
      return;
    }

    const categoryData = this.categoryForm.value;

    if (this.editingCategory) {
      // Update existing category
      this.financeService.updateGivingCategory(this.editingCategory.id, categoryData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Category updated successfully!';
            this.loadCategories();
            this.toggleForm();
            setTimeout(() => this.successMessage = '', 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to update category';
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
            setTimeout(() => this.successMessage = '', 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to create category';
          }
        });
    }
  }

  deleteCategory(categoryId: string): void {
    if (confirm('Are you sure you want to delete this category?')) {
      this.financeService.deleteGivingCategory(categoryId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.successMessage = 'Category deleted successfully!';
            this.loadCategories();
            setTimeout(() => this.successMessage = '', 3000);
          },
          error: (error) => {
            this.errorMessage = error.message || 'Failed to delete category';
          }
        });
    }
  }
}
