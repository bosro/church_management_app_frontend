// src/app/models/form.model.ts
export interface FormTemplate {
  id: string;
  church_id: string;
  title: string;
  description?: string;
  form_fields: FormField[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Computed
  submission_count?: number;
}

export interface FormField {
  id: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select, radio, checkbox
  validation?: FieldValidation;
  order: number;
}

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file';

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface FormSubmission {
  id: string;
  form_template_id: string;
  member_id?: string;
  submission_data: Record<string, any>;
  submitted_at: string;
  status: SubmissionStatus;
  created_at: string;

  // Relations
  form_template?: FormTemplate;
  member?: any;
}

export type SubmissionStatus = 'submitted' | 'reviewed' | 'approved' | 'rejected';
