// src/app/features/cms/components/edit-page/edit-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms';
import { CmsPage } from '../../../../models/cms.model';

@Component({
  selector: 'app-edit-page',
  standalone: false,
  templateUrl: './edit-page.html',
  styleUrl: './edit-page.scss',
})
export class EditPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  pageId: string = '';
  page: CmsPage | null = null;
  pageForm!: FormGroup;
  loading = false;
  loadingPage = true;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canManageContent = false;

  constructor(
    private fb: FormBuilder,
    private cmsService: CmsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.pageId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();

    if (this.pageId) {
      this.loadPage();
    } else {
      this.errorMessage = 'Invalid page ID';
      this.loadingPage = false;
    }
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

  private loadPage(): void {
    this.loadingPage = true;
    this.errorMessage = '';

    this.cmsService
      .getPageById(this.pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.page = page;
          this.populateForm(page);
          this.loadingPage = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load page';
          this.loadingPage = false;
          console.error('Load page error:', error);
        }
      });
  }

  private populateForm(page: CmsPage): void {
    this.pageForm.patchValue({
      title: page.title,
      content: page.content,
      meta_description: page.meta_description || '',
      meta_keywords: page.meta_keywords || ''
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
      .updatePage(this.pageId, this.pageForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Page updated successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/cms/pages']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update page. Please try again.';
          this.scrollToTop();
          console.error('Update page error:', error);
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
