
// src/app/features/cms/components/edit-page/edit-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsPage } from '../../../../models/cms.model';
import { CmsService } from '../../services/cms';

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

  constructor(
    private fb: FormBuilder,
    private cmsService: CmsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.pageId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.pageId) {
      this.loadPage();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.pageForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      content: ['', [Validators.required, Validators.minLength(10)]],
      meta_description: [''],
      meta_keywords: ['']
    });
  }

  private loadPage(): void {
    this.loadingPage = true;

    this.cmsService.getPageById(this.pageId)
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
        }
      });
  }

  private populateForm(page: CmsPage): void {
    this.pageForm.patchValue({
      title: page.title,
      content: page.content,
      meta_description: page.meta_description,
      meta_keywords: page.meta_keywords
    });
  }

  onSubmit(): void {
    if (this.pageForm.invalid) {
      this.markFormGroupTouched(this.pageForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.cmsService.updatePage(this.pageId, this.pageForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Page updated successfully!';
          setTimeout(() => {
            this.router.navigate(['main/cms/pages']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update page. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/cms/pages']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.pageForm.get(fieldName);
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
