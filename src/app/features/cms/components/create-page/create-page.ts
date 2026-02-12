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
    this.pageForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      content: ['', [Validators.required, Validators.minLength(10)]],
      meta_description: [''],
      meta_keywords: ['']
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

    this.cmsService.createPage(this.pageForm.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Page created successfully!';
          setTimeout(() => {
            this.router.navigate(['main/cms/pages']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create page. Please try again.';
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
