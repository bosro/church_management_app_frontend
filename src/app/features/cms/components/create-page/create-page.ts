// src/app/features/cms/components/create-page/create-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';

@Component({
  selector: 'app-create-page',
  standalone: false,
  templateUrl: './create-page.html',
  styleUrl: './create-page.scss',
})
export class CreatePage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pageForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canManageContent = false;

  constructor(
    private fb: FormBuilder,
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageContent = this.cmsService.canManageContent();

    if (!this.canManageContent) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.pageForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      content: ['', [Validators.required, Validators.minLength(10)]],
      meta_description: ['', [Validators.maxLength(160)]],
      meta_keywords: ['', [Validators.maxLength(255)]]
    });
  }

  onSubmit(): void {
    if (this.pageForm.invalid) {
      this.markFormGroupTouched(this.pageForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.cmsService
      .createPage(this.pageForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.successMessage = 'Page created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/cms/pages']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create page. Please try again.';
          this.scrollToTop();
          console.error('Create page error:', error);
        }
      });
  }

  cancel(): void {
    if (this.pageForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/cms/pages']);
      }
    } else {
      this.router.navigate(['main/cms/pages']);
    }
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

  getErrorMessage(fieldName: string): string {
    const control = this.pageForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
