import { Component } from '@angular/core';

@Component({
  selector: 'app-edit-blog',
  standalone: false,
  templateUrl: './edit-blog.html',
  styleUrl: './edit-blog.scss',
})
export class EditBlog {

}
// src/app/features/cms/components/edit-blog/edit-blog.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms.service';
import { BlogPost, BLOG_CATEGORIES } from '../../../../models/cms.model';

@Component({
  selector: 'app-edit-blog',
  templateUrl: './edit-blog.component.html',
  styleUrls: ['./edit-blog.component.scss']
})
export class EditBlogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  postId: string = '';
  post: BlogPost | null = null;
  blogForm!: FormGroup;
  categories = BLOG_CATEGORIES;
  loading = false;
  loadingPost = true;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private cmsService: CmsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.postId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.postId) {
      this.loadPost();
    }
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

  private loadPost(): void {
    this.loadingPost = true;

    this.cmsService.getBlogPostById(this.postId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (post) => {
          this.post = post;
          this.populateForm(post);
          this.loadingPost = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load blog post';
          this.loadingPost = false;
        }
      });
  }

  private populateForm(post: BlogPost): void {
    this.blogForm.patchValue({
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      tags: post.tags ? post.tags.join(', ') : '',
      featured_image_url: post.featured_image_url
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

    this.cmsService.updateBlogPost(this.postId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Blog post updated successfully!';
          setTimeout(() => {
            this.router.navigate(['/cms/blog']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update blog post. Please try again.';
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
