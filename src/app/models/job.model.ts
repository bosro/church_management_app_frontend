// src/app/models/job.model.ts
export type JobType = 'full_time' | 'part_time' | 'contract' | 'volunteer' | 'internship';

export interface JobPost {
  id: string;
  church_id: string;
  title: string;
  description: string;
  company_name?: string;
  location?: string;
  job_type: JobType;
  salary_range?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_name?: string;
  application_url?: string;
  requirements?: string;
  benefits?: string;
  is_active: boolean;
  expires_at?: string;
  posted_by?: string;
  created_at: string;
  updated_at: string;

  // computed
  is_expired?: boolean;
  days_remaining?: number;
}

export interface JobPostFormData {
  title: string;
  description: string;
  company_name?: string;
  location?: string;
  job_type: JobType;
  salary_range?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_name?: string;
  application_url?: string;
  requirements?: string;
  benefits?: string;
  expires_at?: string;
}
