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

// Additional interfaces for member management
export interface MemberStatistics {
  total_members: number;
  active_members: number;
  inactive_members: number;
  new_members_this_month: number;
  new_members_this_year: number;
  male_members: number;
  female_members: number;
  avg_age?: number;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string; data: any }>;
}

export interface MemberCreateInput {
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
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  baptism_date?: string;
  baptism_location?: string;
  join_date: string;
  is_new_convert?: boolean;
  is_visitor?: boolean;
  notes?: string;
}

export interface MemberUpdateInput {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
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
  join_date?: string;
  membership_status?: MembershipStatus;
  is_new_convert?: boolean;
  is_visitor?: boolean;
  notes?: string;
}

// Helper type for member list display
export interface MemberListItem extends Member {
  full_name?: string;
  initials?: string;
  age?: number;
}

// For pagination results
export interface MemberListResult {
  data: Member[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// For member attendance summary
export interface MemberAttendanceSummary {
  member_id: string;
  total_attendance: number;
  attendance_rate: number;
  last_attended?: string;
}

// For member giving summary
export interface MemberGivingSummary {
  member_id: string;
  total_giving: number;
  total_transactions: number;
  avg_transaction: number;
  last_giving_date?: string;
}

// For member ministry involvement
export interface MemberMinistryInvolvement {
  member_id: string;
  ministry_id: string;
  ministry_name: string;
  role?: string;
  joined_date: string;
  is_active: boolean;
}


