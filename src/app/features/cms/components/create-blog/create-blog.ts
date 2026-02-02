
// src/app/features/cms/components/create-blog/create-blog.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BLOG_CATEGORIES } from '../../../../models/cms.model';
import { CmsService } from '../../services/cms';

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

  constructor(
    private fb: FormBuilder,
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.blogForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      excerpt: [''],
      content: ['', [Validators.required, Validators.minLength(10)]],
      category: [''],
      tags: [''],
      featured_image_url: ['']
    });
  }

  onSubmit(): void {
    if (this.blogForm.invalid) {
      this.markFormGroupTouched(this.blogForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const formData = {
      ...this.blogForm.value,
      tags: this.blogForm.value.tags
        ? this.blogForm.value.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : []
    };

    this.cmsService.createBlogPost(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Blog post created successfully!';
          setTimeout(() => {
            this.router.navigate(['/cms/blog']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create blog post. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/cms/blog']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.blogForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }
}
