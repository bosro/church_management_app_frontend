
// src/app/features/forms/components/fill-form/fill-form.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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

  constructor(
    private fb: FormBuilder,
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.formId = this.route.snapshot.paramMap.get('id') || '';
    if (this.formId) {
      this.loadFormTemplate();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadFormTemplate(): void {
    this.loadingForm = true;

    this.formsService.getFormTemplateById(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          this.formTemplate = template;
          this.buildForm(template.form_fields);
          this.loadingForm = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load form';
          this.loadingForm = false;
        }
      });
  }

  private buildForm(fields: FormField[]): void {
    const formControls: any = {};

    fields.forEach(field => {
      const validators = field.required ? [Validators.required] : [];

      if (field.field_type === 'email') {
        validators.push(Validators.email);
      }

      if (field.field_type === 'checkbox') {
        formControls[field.id] = this.fb.array([]);
      } else {
        formControls[field.id] = ['', validators];
      }
    });

    this.submissionForm = this.fb.group(formControls);
  }

  onCheckboxChange(fieldId: string, option: string, event: any): void {
    const control = this.submissionForm.get(fieldId);
    if (control) {
      const currentValue = control.value || [];
      if (event.target.checked) {
        control.setValue([...currentValue, option]);
      } else {
        control.setValue(currentValue.filter((v: string) => v !== option));
      }
    }
  }

  isCheckboxChecked(fieldId: string, option: string): boolean {
    const control = this.submissionForm.get(fieldId);
    return control?.value?.includes(option) || false;
  }

  onSubmit(): void {
    if (this.submissionForm.invalid) {
      this.markFormGroupTouched(this.submissionForm);
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const submissionData: Record<string, any> = {};
    this.formTemplate?.form_fields.forEach(field => {
      submissionData[field.label] = this.submissionForm.get(field.id)?.value;
    });

    this.formsService.submitForm(this.formId, submissionData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form submitted successfully!';
          this.submissionForm.reset();
          this.loading = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 5000);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to submit form. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/forms']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(field: FormField): string {
    const control = this.submissionForm.get(field.id);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    return '';
  }
}
