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

  // Permissions
  canManageForms = false;

  constructor(
    private fb: FormBuilder,
    private formsService: FormsService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
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

  private loadFormTemplate(): void {
    this.loadingForm = true;
    this.errorMessage = '';

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
          console.error('Error loading form:', error);
        }
      });
  }

  private populateForm(template: FormTemplate): void {
    this.formDetailsForm.patchValue({
      title: template.title,
      description: template.description || ''
    });

    // Deep copy to avoid reference issues
    this.formFields = JSON.parse(JSON.stringify(template.form_fields));
  }

  // Field Management (same as create)
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
      this.formFields[this.editingIndex] = newField;
      this.editingIndex = -1;
      this.editingField = null;
    } else {
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

    this.formsService.updateFormTemplate(this.formId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Form updated successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/forms']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to update form. Please try again.';
          this.scrollToTop();
          console.error('Error updating form:', error);
        }
      });
  }

  cancel(): void {
    if (this.formDetailsForm.dirty || JSON.stringify(this.formFields) !== JSON.stringify(this.formTemplate?.form_fields)) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/forms']);
      }
    } else {
      this.router.navigate(['main/forms']);
    }
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



<!-- src/app/features/forms/components/edit-form/edit-form.component.html -->
<div class="dashboard-layout">
  <app-sidebar></app-sidebar>

  <div class="dashboard-content">
    <app-header></app-header>

    <div class="dashboard-body">
      <div class="create-form-container">
        <!-- Loading State -->
        <div *ngIf="loadingForm" class="loading-container">
          <app-loading-spinner size="large" message="Loading form..."></app-loading-spinner>
        </div>

        <!-- Form Content -->
        <div *ngIf="!loadingForm">
          <!-- Page Header -->
          <div class="page-header">
            <div class="header-left">
              <button class="back-btn" (click)="cancel()">
                <i class="ri-arrow-left-line"></i>
              </button>
              <div>
                <h1>Edit Form</h1>
                <p class="subtitle" *ngIf="formTemplate">{{ formTemplate.title }}</p>
              </div>
            </div>
          </div>

          <!-- Success/Error Messages -->
          <div *ngIf="successMessage" class="success-alert">
            <i class="ri-checkbox-circle-line"></i>
            <span>{{ successMessage }}</span>
          </div>

          <div *ngIf="errorMessage" class="error-alert">
            <i class="ri-error-warning-line"></i>
            <span>{{ errorMessage }}</span>
          </div>

          <div class="builder-layout">
            <!-- Left Panel - Form Builder -->
            <div class="builder-panel">
              <div class="panel-card">
                <h3>Form Details</h3>
                <form [formGroup]="formDetailsForm">
                  <div class="form-group">
                    <label>Form Title *</label>
                    <input
                      type="text"
                      formControlName="title"
                      placeholder="e.g., Member Registration, Event RSVP"
                    />
                  </div>

                  <div class="form-group">
                    <label>Description</label>
                    <textarea
                      formControlName="description"
                      placeholder="Describe the purpose of this form..."
                      rows="3"
                    ></textarea>
                  </div>
                </form>
              </div>

              <!-- Add Field Section -->
              <div class="panel-card">
                <h3>{{ editingIndex >= 0 ? 'Edit Field' : 'Add Field' }}</h3>

                <div class="form-group">
                  <label>Field Type *</label>
                  <div class="field-types-grid">
                    <div
                      *ngFor="let type of fieldTypes"
                      class="field-type-btn"
                      [class.selected]="newFieldType === type.value"
                      (click)="newFieldType = type.value"
                    >
                      <i [class]="type.icon"></i>
                      <span>{{ type.label }}</span>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label>Field Label *</label>
                  <input
                    type="text"
                    [(ngModel)]="newFieldLabel"
                    placeholder="e.g., Full Name, Email Address"
                  />
                </div>

                <div class="form-group">
                  <label>Placeholder</label>
                  <input
                    type="text"
                    [(ngModel)]="newFieldPlaceholder"
                    placeholder="Enter placeholder text..."
                  />
                </div>

                <div class="form-group" *ngIf="needsOptions(newFieldType)">
                  <label>Options (one per line) *</label>
                  <textarea
                    [(ngModel)]="newFieldOptions"
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    rows="4"
                  ></textarea>
                </div>

                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="newFieldRequired" />
                    <span>Required Field</span>
                  </label>
                </div>

                <div class="field-actions">
                  <button
                    *ngIf="editingIndex >= 0"
                    class="btn-secondary"
                    (click)="cancelEditField()"
                  >
                    Cancel
                  </button>
                  <button class="btn-primary" (click)="addField()">
                    <i [class]="editingIndex >= 0 ? 'ri-save-line' : 'ri-add-line'"></i>
                    {{ editingIndex >= 0 ? 'Update Field' : 'Add Field' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Panel - Preview -->
            <div class="preview-panel">
              <div class="panel-card">
                <div class="preview-header">
                  <h3>Form Preview</h3>
                  <span class="field-count">{{ formFields.length }} field{{ formFields.length !== 1 ? 's' : '' }}</span>
                </div>

                <div class="preview-form" *ngIf="formFields.length > 0">
                  <div
                    *ngFor="let field of formFields; let i = index"
                    class="preview-field"
                  >
                    <div class="field-header">
                      <div class="field-label">
                        {{ field.label }}
                        <span class="required-mark" *ngIf="field.required">*</span>
                      </div>
                      <div class="field-controls">
                        <button
                          class="control-btn"
                          (click)="moveFieldUp(i)"
                          [disabled]="i === 0"
                        >
                          <i class="ri-arrow-up-line"></i>
                        </button>
                        <button
                          class="control-btn"
                          (click)="moveFieldDown(i)"
                          [disabled]="i === formFields.length - 1"
                        >
                          <i class="ri-arrow-down-line"></i>
                        </button>
                        <button class="control-btn" (click)="editField(field, i)">
                          <i class="ri-edit-line"></i>
                        </button>
                        <button class="control-btn danger" (click)="removeField(i)">
                          <i class="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </div>

                    <!-- Field Preview -->
                    <div class="field-input">
                      <input
                        *ngIf="field.field_type === 'text' || field.field_type === 'email' || field.field_type === 'phone'"
                        type="text"
                        [placeholder]="field.placeholder || ''"
                        disabled
                      />

                      <input
                        *ngIf="field.field_type === 'number'"
                        type="number"
                        [placeholder]="field.placeholder || ''"
                        disabled
                      />

                      <input
                        *ngIf="field.field_type === 'date'"
                        type="date"
                        disabled
                      />

                      <textarea
                        *ngIf="field.field_type === 'textarea'"
                        [placeholder]="field.placeholder || ''"
                        rows="3"
                        disabled
                      ></textarea>

                      <select *ngIf="field.field_type === 'select'" disabled>
                        <option value="">Select an option</option>
                        <option *ngFor="let option of field.options">{{ option }}</option>
                      </select>

                      <div *ngIf="field.field_type === 'radio'" class="radio-group">
                        <label *ngFor="let option of field.options" class="radio-label">
                          <input type="radio" disabled />
                          <span>{{ option }}</span>
                        </label>
                      </div>

                      <div *ngIf="field.field_type === 'checkbox'" class="checkbox-group-preview">
                        <label *ngFor="let option of field.options" class="checkbox-label-preview">
                          <input type="checkbox" disabled />
                          <span>{{ option }}</span>
                        </label>
                      </div>

                      <div *ngIf="field.field_type === 'file'" class="file-upload">
                        <i class="ri-upload-cloud-line"></i>
                        <span>Choose file</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="empty-preview" *ngIf="formFields.length === 0">
                  <i class="ri-file-list-3-line"></i>
                  <p>No fields added yet</p>
                  <p class="hint">Add fields using the panel on the left</p>
                </div>
              </div>

              <!-- Submit Button -->
              <div class="submit-section">
                <button
                  class="btn-secondary btn-full"
                  (click)="cancel()"
                  [disabled]="loading"
                >
                  Cancel
                </button>
                <button
                  class="btn-primary btn-full"
                  (click)="onSubmit()"
                  [disabled]="loading || formFields.length === 0"
                >
                  <span *ngIf="!loading">
                    <i class="ri-save-line"></i>
                    Update Form
                  </span>
                  <span *ngIf="loading">
                    <i class="ri-loader-4-line spin"></i>
                    Updating...
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
