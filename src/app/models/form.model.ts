// src/app/models/form.model.ts
export interface FormTemplate {
  id: string;
  church_id: string;
  title: string;
  description?: string | null;
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
  form_id: string;  // Changed from form_template_id to form_id
  member_id?: string;
  submission_data: Record<string, any>;
  submitted_at: string;
  ip_address?: string;  // Keep existing fields
  user_agent?: string;  // Keep existing fields

  // We'll manage status in the app layer since it's not in the DB
  status?: SubmissionStatus;

  // Relations
  form_template?: FormTemplate;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone_primary?: string;
    member_number?: string;
    photo_url?: string;
  };
}

export type SubmissionStatus = 'submitted' | 'reviewed' | 'approved' | 'rejected';

// Statistics interface for reporting
export interface FormStatistics {
  total_submissions: number;
  pending_submissions: number;
  reviewed_submissions: number;
  approved_submissions: number;
  rejected_submissions: number;
}
