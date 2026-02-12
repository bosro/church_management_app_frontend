
// src/app/features/forms/components/edit-form/edit-form.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormTemplate, FormField, FieldType } from '../../../../models/form.model';
import { FormsService } from '../../services/forms';

@Component({
 selector: 'app-edit-form',
  standalone: false,
  templateUrl: './edit-form.html',
  styleUrl: './edit-form.scss',
})
export class EditForm implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  formId: string = '';
  formTemplate: FormTemplate | null = null;
  formDetailsForm!: FormGroup;
  formFields: FormField[] = [];
  loading = false;
  loadingForm = true;
  errorMessage = '';
  successMessage = '';

  editingField: FormField | null = null;
  editingIndex: number = -1;

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

  newFieldLabel = '';
  newFieldType: FieldType = 'text';
  newFieldRequired = false;
  newFieldPlaceholder = '';
  newFieldOptions = '';

  constructor(
    private fb: FormBuilder,
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.formId = this.route.snapshot.paramMap.get('id') || '';
    this.initForm();
    if (this.formId) {
      this.loadFormTemplate();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.formDetailsForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['']
    });
  }

  private loadFormTemplate(): void {
    this.loadingForm = true;

    this.formsService.getFormTemplateById(this.formId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          this.formTemplate = template;
          this.populateForm(template);
          this.loadingForm = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load form template';
          this.loadingForm = false;
        }
      });
  }

  private populateForm(template: FormTemplate): void {
    this.formDetailsForm.patchValue({
      title: template.title,
      description: template.description
    });
    this.formFields = [...template.form_fields];
  }

  // Field Management (same as create)
  addField(): void {
    if (!this.newFieldLabel.trim()) {
      this.errorMessage = 'Field label is required';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    if (['select', 'radio', 'checkbox'].includes(this.newFieldType) && !this.newFieldOptions.trim()) {
      this.errorMessage = 'Options are required for this field type';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    const newField: FormField = {
      id: this.generateFieldId(),
      label: this.newFieldLabel,
      field_type: this.newFieldType,
      required: this.newFieldRequired,
      placeholder: this.newFieldPlaceholder || undefined,
      options: this.newFieldOptions ? this.newFieldOptions.split('\n').map(o => o.trim()).filter(o => o) : undefined,
      order: this.formFields.length
    };

    if (this.editingIndex >= 0) {
      this.formFields[this.editingIndex] = newField;
      this.editingIndex = -1;
      this.editingField = null;
    } else {
      this.formFields.push(newField);
    }

    this.resetFieldForm();
  }

  editField(field: FormField, index: number): void {
    this.editingField = field;
    this.editingIndex = index;
    this.newFieldLabel = field.label;
    this.newFieldType = field.field_type;
    this.newFieldRequired = field.required;
    this.newFieldPlaceholder = field.placeholder || '';
    this.newFieldOptions = field.options ? field.options.join('\n') : '';
  }

  removeField(index: number): void {
    this.formFields.splice(index, 1);
    this.formFields.forEach((field, i) => field.order = i);
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
  }

  onSubmit(): void {
    if (this.formDetailsForm.invalid) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    if (this.formFields.length === 0) {
      this.errorMessage = 'Please add at least one field to the form';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const formData = {
      title: this.formDetailsForm.value.title,
      description: this.formDetailsForm.value.description,
      form_fields: this.formFields
    };

    this.formsService.updateFormTemplate(this.formId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form updated successfully!';
          setTimeout(() => {
            this.router.navigate(['main/forms']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update form. Please try again.';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/forms']);
  }

  private generateFieldId(): string {
    return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getFieldTypeIcon(type: FieldType): string {
    return this.fieldTypes.find(ft => ft.value === type)?.icon || 'ri-input-field';
  }

  needsOptions(type: FieldType): boolean {
    return ['select', 'radio', 'checkbox'].includes(type);
  }
}
