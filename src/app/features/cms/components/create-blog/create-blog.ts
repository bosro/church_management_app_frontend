// src/app/features/cms/components/create-blog/create-blog.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms'
import { BLOG_CATEGORIES } from '../../../../models/cms.model';

@Component({
  selector: 'app-create-blog',
  standalone: false,
  templateUrl: './create-blog.html',
  styleUrl: './create-blog.scss',
})
export class CreateBlog implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  blogForm!: FormGroup;
  categories = BLOG_CATEGORIES;
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
    this.blogForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      excerpt: ['', [Validators.maxLength(300)]],
      content: ['', [Validators.required, Validators.minLength(10)]],
      category: [''],
      tags: [''],
      featured_image_url: ['', [Validators.pattern(/^https?:\/\/.+/)]]
    });
  }

  onSubmit(): void {
    if (this.blogForm.invalid) {
      this.markFormGroupTouched(this.blogForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = {
      ...this.blogForm.value,
      tags: this.blogForm.value.tags
        ? this.blogForm.value.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : []
    };

    this.cmsService
      .createBlogPost(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (post) => {
          this.successMessage = 'Blog post created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/cms/blog']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create blog post. Please try again.';
          this.scrollToTop();
          console.error('Create blog error:', error);
        }
      });
  }

  cancel(): void {
    if (this.blogForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/cms/blog']);
      }
    } else {
      this.router.navigate(['main/cms/blog']);
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
    const control = this.blogForm.get(fieldName);

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
    if (control.hasError('pattern')) {
      return 'Please enter a valid URL (starting with http:// or https://)';
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
