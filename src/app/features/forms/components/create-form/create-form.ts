// src/app/features/forms/components/create-form/create-form.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormField, FieldType } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';

@Component({
  selector: 'app-create-form',
  standalone: false,
  templateUrl: './create-form.html',
  styleUrl: './create-form.scss',
})
export class CreateForm implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  formDetailsForm!: FormGroup;
  formFields: FormField[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';

  // Field being edited
  editingField: FormField | null = null;
  editingIndex: number = -1;

  // Field types
  fieldTypes: { value: FieldType, label: string, icon: string }[] = [
    { value: 'text', label: 'Text Input', icon: 'ri-text' },
    { value: 'email', label: 'Email', icon: 'ri-mail-line' },
    { value: 'phone', label: 'Phone', icon: 'ri-phone-line' },
    { value: 'number', label: 'Number', icon: 'ri-hashtag' },
    { value: 'textarea', label: 'Text Area', icon: 'ri-file-text-line' },
    { value: 'select', label: 'Dropdown', icon: 'ri-arrow-down-s-line' },
    { value: 'radio', label: 'Radio Buttons', icon: 'ri-radio-button-line' },
    { value: 'checkbox', label: 'Checkboxes', icon: 'ri-checkbox-line' },
    { value: 'date', label: 'Date', icon: 'ri-calendar-line' },
    { value: 'file', label: 'File Upload', icon: 'ri-file-upload-line' }
  ];

  // New field form
  newFieldLabel = '';
  newFieldType: FieldType = 'text';
  newFieldRequired = false;
  newFieldPlaceholder = '';
  newFieldOptions = '';

  // Permissions
  canManageForms = false;

  constructor(
    private fb: FormBuilder,
    private formsService: FormsService,
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
    this.canManageForms = this.formsService.canManageForms();

    if (!this.canManageForms) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.formDetailsForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]]
    });
  }

  // Field Management
  addField(): void {
    if (!this.newFieldLabel.trim()) {
      this.errorMessage = 'Field label is required';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (this.newFieldLabel.length > 100) {
      this.errorMessage = 'Field label must be 100 characters or less';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (this.needsOptions(this.newFieldType) && !this.newFieldOptions.trim()) {
      this.errorMessage = 'Options are required for this field type';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    const newField: FormField = {
      id: this.generateFieldId(),
      label: this.newFieldLabel.trim(),
      field_type: this.newFieldType,
      required: this.newFieldRequired,
      placeholder: this.newFieldPlaceholder?.trim() || undefined,
      options: this.newFieldOptions
        ? this.newFieldOptions.split('\n').map(o => o.trim()).filter(o => o)
        : undefined,
      order: this.formFields.length
    };

    if (this.editingIndex >= 0) {
      // Update existing field
      this.formFields[this.editingIndex] = newField;
      this.editingIndex = -1;
      this.editingField = null;
    } else {
      // Add new field
      this.formFields.push(newField);
    }

    this.resetFieldForm();
    this.clearMessages();
  }

  editField(field: FormField, index: number): void {
    this.editingField = field;
    this.editingIndex = index;
    this.newFieldLabel = field.label;
    this.newFieldType = field.field_type;
    this.newFieldRequired = field.required;
    this.newFieldPlaceholder = field.placeholder || '';
    this.newFieldOptions = field.options ? field.options.join('\n') : '';
    this.clearMessages();
  }

  removeField(index: number): void {
    if (confirm('Are you sure you want to remove this field?')) {
      this.formFields.splice(index, 1);
      // Update order
      this.formFields.forEach((field, i) => field.order = i);
    }
  }

  moveFieldUp(index: number): void {
    if (index > 0) {
      [this.formFields[index], this.formFields[index - 1]] =
      [this.formFields[index - 1], this.formFields[index]];
      this.updateFieldOrder();
    }
  }

  moveFieldDown(index: number): void {
    if (index < this.formFields.length - 1) {
      [this.formFields[index], this.formFields[index + 1]] =
      [this.formFields[index + 1], this.formFields[index]];
      this.updateFieldOrder();
    }
  }

  private updateFieldOrder(): void {
    this.formFields.forEach((field, i) => field.order = i);
  }

  private resetFieldForm(): void {
    this.newFieldLabel = '';
    this.newFieldType = 'text';
    this.newFieldRequired = false;
    this.newFieldPlaceholder = '';
    this.newFieldOptions = '';
  }

  cancelEditField(): void {
    this.editingIndex = -1;
    this.editingField = null;
    this.resetFieldForm();
    this.clearMessages();
  }

  // Form Submission
  onSubmit(): void {
    if (this.formDetailsForm.invalid) {
      this.markFormGroupTouched(this.formDetailsForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    if (this.formFields.length === 0) {
      this.errorMessage = 'Please add at least one field to the form';
      this.scrollToTop();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = {
      title: this.formDetailsForm.value.title.trim(),
      description: this.formDetailsForm.value.description?.trim() || undefined,
      form_fields: this.formFields
    };

    this.formsService.createFormTemplate(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form created successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/forms']);
          }, 1500);
        },
        error: (error:any) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create form. Please try again.';
          this.scrollToTop();
          console.error('Error creating form:', error);
        }
      });
  }

  cancel(): void {
    if (this.formFields.length > 0 || this.formDetailsForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/forms']);
      }
    } else {
      this.router.navigate(['main/forms']);
    }
  }

  // Helper Methods
  private generateFieldId(): string {
    return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getFieldTypeIcon(type: FieldType): string {
    return this.fieldTypes.find(ft => ft.value === type)?.icon || 'ri-input-field';
  }

  needsOptions(type: FieldType): boolean {
    return ['select', 'radio', 'checkbox'].includes(type);
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

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
