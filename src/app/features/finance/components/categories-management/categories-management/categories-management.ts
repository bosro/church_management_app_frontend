// src/app/features/finance/components/categories-management/categories-management.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GivingCategory } from '../../../../../models/giving.model';
import { FinanceService } from '../../../services/finance.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { AuthService } from '../../../../../core/services/auth';

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

  // ── Public giving QR ─────────────────────────────────────
  showQrModal = false;
  /** null = the general QR (payer chooses the category on the page) */
  qrCategory: GivingCategory | null = null;
  qrUrl = '';
  qrCopied = false;
  qrToggling = false;

  constructor(
    private fb: FormBuilder,
    private financeService: FinanceService,
    public permissionService: PermissionService,
    private authService: AuthService,
    private router: Router,
    private location: Location,
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
    const role = this.authService.getCurrentUserRole();

    const manageRoles = ['finance_officer'];

    this.canManageCategories =
      this.permissionService.isAdmin ||
      this.permissionService.finance.manage ||
      manageRoles.includes(role);

    const canView =
      this.permissionService.isAdmin ||
      this.permissionService.finance.view ||
      [
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'finance_officer',
      ].includes(role);

    if (!canView) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.categoryForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(50),
        ],
      ],
      description: ['', [Validators.maxLength(200)]],
    });
  }

  loadCategories(): void {
    this.loading = true;
    this.errorMessage = '';

    this.financeService
      .getGivingCategories()
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
        },
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
      description: category.description || '',
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
      description: this.categoryForm.value.description?.trim() || undefined,
    };

    if (this.editingCategory) {
      // Update existing category
      this.financeService
        .updateGivingCategory(this.editingCategory.id, categoryData)
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
          },
        });
    } else {
      // Create new category
      this.financeService
        .createGivingCategory(categoryData)
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
          },
        });
    }
  }

  deleteCategory(categoryId: string): void {
    if (!this.canManageCategories) {
      this.errorMessage = 'You do not have permission to delete categories';
      return;
    }

    const confirmMessage =
      'Are you sure you want to delete this category? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.financeService
      .deleteGivingCategory(categoryId)
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
        },
      });
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC GIVING QR  (category QR + general QR)
  // ══════════════════════════════════════════════════════════

  /** Open the QR for one category, or pass null for the general QR. */
  openQr(category: GivingCategory | null): void {
    this.qrCategory = category;
    this.qrUrl = this.financeService.getPublicGivingUrl(category?.id);
    this.qrCopied = false;
    this.showQrModal = true;
  }

  closeQr(): void {
    this.showQrModal = false;
    this.qrCategory = null;
    this.qrUrl = '';
  }

  get qrTitle(): string {
    return this.qrCategory ? this.qrCategory.name : 'Give Online';
  }

  get qrSubtitle(): string {
    return this.qrCategory
      ? 'Scan to give'
      : 'Scan, then choose what you are giving to';
  }

  /** Categories created before the feature existed have no value → treated as enabled. */
  isPublicEnabled(category: GivingCategory): boolean {
    return category.public_giving_enabled !== false;
  }

  copyQrLink(): void {
    navigator.clipboard
      .writeText(this.qrUrl)
      .then(() => {
        this.qrCopied = true;
        setTimeout(() => (this.qrCopied = false), 2500);
      })
      .catch(() => {
        this.errorMessage = 'Could not copy the link';
        setTimeout(() => (this.errorMessage = ''), 3000);
      });
  }

  /** Downloads a print-ready PNG: title on top, QR underneath. */
  downloadQr(): void {
    const src = document.querySelector(
      '.qr-giving-code canvas',
    ) as HTMLCanvasElement | null;
    if (!src) return;

    const pad = 40;
    const headH = 110;
    const footH = 56;
    const w = src.width + pad * 2;
    const h = headH + src.height + footH + pad / 2;

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';

    // Title — shrink the font until it fits
    let size = 34;
    ctx.fillStyle = '#111827';
    do {
      ctx.font = `800 ${size}px "Nunito Sans", Arial, sans-serif`;
      size -= 2;
    } while (ctx.measureText(this.qrTitle).width > w - 40 && size > 14);
    ctx.fillText(this.qrTitle, w / 2, 56);

    ctx.fillStyle = '#6B7280';
    ctx.font = '500 18px "Nunito Sans", Arial, sans-serif';
    ctx.fillText(this.qrSubtitle, w / 2, 90);

    ctx.drawImage(src, pad, headH);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '500 14px "Nunito Sans", Arial, sans-serif';
    ctx.fillText('Point your phone camera at the code', w / 2, headH + src.height + 34);

    const slug = (this.qrCategory?.name || 'general')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `giving-qr-${slug || 'category'}.png`;
    a.click();
  }

  /** Admin switch: stop / resume accepting public payments for this category. */
  togglePublicGiving(): void {
    const cat = this.qrCategory;
    if (!cat || !this.canManageCategories || this.qrToggling) return;

    const next = !this.isPublicEnabled(cat);
    this.qrToggling = true;
    this.financeService
      .setCategoryPublicGiving(cat.id, next)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          cat.public_giving_enabled = next;
          this.qrToggling = false;
          this.successMessage = next
            ? `Public giving is ON for ${cat.name}.`
            : `Public giving is OFF for ${cat.name}. Its QR code will show "not available" until you turn it back on.`;
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (error) => {
          this.qrToggling = false;
          this.errorMessage =
            error.message ||
            'Could not update public giving. Has the QR giving SQL migration been run?';
        },
      });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
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
  
  goBack(): void {
    this.location.back();
  }
}
