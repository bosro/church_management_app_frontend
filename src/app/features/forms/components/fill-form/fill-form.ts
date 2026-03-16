// src/app/features/forms/components/fill-form/fill-form.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate, FormField } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';

@Component({
  selector: 'app-fill-form',
  standalone: false,
  templateUrl: './fill-form.html',
  styleUrl: './fill-form.scss',
})
export class FillForm implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  formId: string = '';
  formTemplate: FormTemplate | null = null;
  submissionForm!: FormGroup;
  loading = false;
  loadingForm = true;
  errorMessage = '';
  successMessage = '';

  // Permissions
  canSubmitForms = false;

  constructor(
    private fb: FormBuilder,
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.formId = this.route.snapshot.paramMap.get('id') || '';

    if (this.formId) {
      this.loadFormTemplate();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canSubmitForms = this.formsService.canSubmitForms();

    if (!this.canSubmitForms) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadFormTemplate(): void {
    this.loadingForm = true;
    this.errorMessage = '';

    this.formsService.getFormTemplateById(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          if (!template.is_active) {
            this.errorMessage = 'This form is no longer accepting responses';
            this.loadingForm = false;
            return;
          }

          this.formTemplate = template;
          this.buildForm(template.form_fields);
          this.loadingForm = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load form';
          this.loadingForm = false;
          console.error('Error loading form:', error);
        }
      });
  }

  private buildForm(fields: FormField[]): void {
    const formControls: any = {};

    fields.forEach(field => {
      const validators = [];

      if (field.required) {
        validators.push(Validators.required);
      }

      if (field.field_type === 'email') {
        validators.push(Validators.email);
      }

      if (field.field_type === 'phone') {
        validators.push(Validators.pattern(/^[0-9+\-\s()]+$/));
      }

      if (field.field_type === 'checkbox') {
        formControls[field.id] = this.fb.array([], field.required ? Validators.required : []);
      } else {
        formControls[field.id] = ['', validators];
      }
    });

    this.submissionForm = this.fb.group(formControls);
  }

  onCheckboxChange(fieldId: string, option: string, event: any): void {
    const formArray = this.submissionForm.get(fieldId) as FormArray;

    if (event.target.checked) {
      formArray.push(new FormControl(option));
    } else {
      const index = formArray.controls.findIndex(x => x.value === option);
      if (index !== -1) {
        formArray.removeAt(index);
      }
    }
  }

  isCheckboxChecked(fieldId: string, option: string): boolean {
    const formArray = this.submissionForm.get(fieldId) as FormArray;
    return formArray?.value?.includes(option) || false;
  }

  onSubmit(): void {
    if (this.submissionForm.invalid) {
      this.markFormGroupTouched(this.submissionForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToError();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Build submission data with field labels as keys
    const submissionData: Record<string, any> = {};

    this.formTemplate?.form_fields.forEach(field => {
      const value = this.submissionForm.get(field.id)?.value;

      // Convert FormArray values to simple arrays
      if (field.field_type === 'checkbox' && Array.isArray(value)) {
        submissionData[field.label] = value;
      } else {
        submissionData[field.label] = value || '';
      }
    });

    this.formsService.submitForm(this.formId, submissionData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form submitted successfully! Thank you for your response.';
          this.submissionForm.reset();
          this.loading = false;

          // Reset checkbox arrays
          this.formTemplate?.form_fields.forEach(field => {
            if (field.field_type === 'checkbox') {
              const formArray = this.submissionForm.get(field.id) as FormArray;
              formArray.clear();
            }
          });

          this.scrollToTop();

          setTimeout(() => {
            this.successMessage = '';
          }, 5000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to submit form. Please try again.';
          this.scrollToTop();
          console.error('Error submitting form:', error);
        }
      });
  }

  cancel(): void {
    if (this.submissionForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/forms']);
      }
    } else {
      this.router.navigate(['main/forms']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }

      if (control instanceof FormArray) {
        control.markAsTouched();
      }
    });
  }

  getErrorMessage(field: FormField): string {
    const control = this.submissionForm.get(field.id);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control.hasError('pattern')) {
      return 'Please enter a valid phone number';
    }

    return 'Invalid input';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scrollToError(): void {
    const firstError = document.querySelector('.error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      this.scrollToTop();
    }
  }
}


<!-- src/app/features/forms/components/fill-form/fill-form.component.html -->
<div class="dashboard-layout">
  <app-sidebar></app-sidebar>

  <div class="dashboard-content">
    <app-header></app-header>

    <div class="dashboard-body">
      <div class="fill-form-container">
        <!-- Loading State -->
        <div *ngIf="loadingForm" class="loading-container">
          <app-loading-spinner size="large" message="Loading form..."></app-loading-spinner>
        </div>

        <!-- Form Content -->
        <div *ngIf="!loadingForm && formTemplate" class="form-wrapper">
          <div class="form-header">
            <button class="back-btn" (click)="cancel()">
              <i class="ri-arrow-left-line"></i>
            </button>
            <div>
              <h1>{{ formTemplate.title }}</h1>
              <p class="form-description" *ngIf="formTemplate.description">
                {{ formTemplate.description }}
              </p>
            </div>
          </div>

          <!-- Success Message -->
          <div *ngIf="successMessage" class="success-alert">
            <i class="ri-checkbox-circle-line"></i>
            <span>{{ successMessage }}</span>
          </div>

          <!-- Error Message -->
          <div *ngIf="errorMessage" class="error-alert">
            <i class="ri-error-warning-line"></i>
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Form -->
          <div class="form-card">
            <form [formGroup]="submissionForm" (ngSubmit)="onSubmit()">
              <div class="form-fields">
                <div *ngFor="let field of formTemplate.form_fields" class="form-field">
                  <label [for]="field.id">
                    {{ field.label }}
                    <span class="required-mark" *ngIf="field.required">*</span>
                  </label>

                  <!-- Text Input -->
                  <input
                    *ngIf="field.field_type === 'text'"
                    [id]="field.id"
                    type="text"
                    [formControlName]="field.id"
                    [placeholder]="field.placeholder || ''"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  />

                  <!-- Email Input -->
                  <input
                    *ngIf="field.field_type === 'email'"
                    [id]="field.id"
                    type="email"
                    [formControlName]="field.id"
                    [placeholder]="field.placeholder || ''"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  />

                  <!-- Phone Input -->
                  <input
                    *ngIf="field.field_type === 'phone'"
                    [id]="field.id"
                    type="tel"
                    [formControlName]="field.id"
                    [placeholder]="field.placeholder || ''"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  />

                  <!-- Number Input -->
                  <input
                    *ngIf="field.field_type === 'number'"
                    [id]="field.id"
                    type="number"
                    [formControlName]="field.id"
                    [placeholder]="field.placeholder || ''"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  />

                  <!-- Date Input -->
                  <input
                    *ngIf="field.field_type === 'date'"
                    [id]="field.id"
                    type="date"
                    [formControlName]="field.id"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  />

                  <!-- Textarea -->
                  <textarea
                    *ngIf="field.field_type === 'textarea'"
                    [id]="field.id"
                    [formControlName]="field.id"
                    [placeholder]="field.placeholder || ''"
                    rows="4"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  ></textarea>

                  <!-- Select -->
                  <select
                    *ngIf="field.field_type === 'select'"
                    [id]="field.id"
                    [formControlName]="field.id"
                    [class.error]="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                  >
                    <option value="">Select an option</option>
                    <option *ngFor="let option of field.options" [value]="option">
                      {{ option }}
                    </option>
                  </select>

                  <!-- Radio Buttons -->
                  <div *ngIf="field.field_type === 'radio'" class="radio-group">
                    <label *ngFor="let option of field.options" class="radio-label">
                      <input
                        type="radio"
                        [formControlName]="field.id"
                        [value]="option"
                      />
                      <span>{{ option }}</span>
                    </label>
                  </div>

                  <!-- Checkboxes -->
                  <div *ngIf="field.field_type === 'checkbox'" class="checkbox-group">
                    <label *ngFor="let option of field.options" class="checkbox-label">
                      <input
                        type="checkbox"
                        [checked]="isCheckboxChecked(field.id, option)"
                        (change)="onCheckboxChange(field.id, option, $event)"
                      />
                      <span>{{ option }}</span>
                    </label>
                  </div>

                  <!-- File Upload -->
                  <div *ngIf="field.field_type === 'file'" class="file-upload-wrapper">
                    <input
                      type="file"
                      [id]="field.id"
                      [formControlName]="field.id"
                    />
                  </div>

                  <!-- Error Message -->
                  <span
                    *ngIf="submissionForm.get(field.id)?.invalid && submissionForm.get(field.id)?.touched"
                    class="error-message"
                  >
                    {{ getErrorMessage(field) }}
                  </span>
                </div>
              </div>

              <!-- Submit Button -->
              <div class="form-actions">
                <button
                  type="button"
                  class="btn-secondary"
                  (click)="cancel()"
                  [disabled]="loading"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn-primary"
                  [disabled]="loading"
                >
                  <span *ngIf="!loading">
                    <i class="ri-send-plane-line"></i>
                    Submit Form
                  </span>
                  <span *ngIf="loading">
                    <i class="ri-loader-4-line spin"></i>
                    Submitting...
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>


