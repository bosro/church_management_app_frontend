// src/app/models/member.model.ts
export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';
export type MembershipStatus = 'active' | 'inactive' | 'transferred' | 'deceased';

export interface Member {
  id: string;
  church_id: string;
  branch_id?: string;
  user_id?: string;
  member_number: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth?: string;
  gender?: Gender;
  marital_status?: MaritalStatus;
  phone_primary?: string;
  phone_secondary?: string;
  email?: string;
  address?: string;
  city?: string;
  occupation?: string;
  employer?: string;
  education_level?: string;
  photo_url?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  baptism_date?: string;
  baptism_location?: string;
  join_date: string;
  membership_status: MembershipStatus;
  is_new_convert: boolean;
  is_visitor: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MemberSearchFilters {
  search_term?: string;
  gender_filter?: Gender;
  status_filter?: MembershipStatus;
  branch_filter?: string;
  ministry_filter?: string;
  min_age?: number;
  max_age?: number;
}
