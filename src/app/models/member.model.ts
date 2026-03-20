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
  branch_id?: string;
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

export interface MemberListItem extends Member {
  full_name?: string;
  initials?: string;
  age?: number;
}

export interface MemberListResult {
  data: Member[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export interface MemberAttendanceRecord {
  id: string;
  attendance_event_id: string;
  checked_in_at: string | null;
  check_in_method: string | null;
  notes: string | null;
  // joined from attendance_events
  event_name: string;
  event_type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
}

// Replaces the old MemberAttendanceSummary (which had attendance_rate/last_attended)
export interface MemberAttendanceSummary {
  member_id: string;
  total_attendance: number;
  last_attendance: string | null;
  attendance_last_30_days: number;
  attendance_this_year: number;
}

// ── Giving ────────────────────────────────────────────────────────────────────

export interface MemberGivingTransaction {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string | null;
  transaction_date: string;
  fiscal_year: number | null;
  notes: string | null;
  created_at: string;
  // joined from giving_categories
  category_name: string;
}

// Replaces the old MemberGivingSummary (which had total_giving/last_giving_date at top level)
export interface MemberGivingSummary {
  member_id?: string;
  total_transactions: number;
  total_given: number;
  avg_transaction: number;
  last_giving_date: string | null;
  first_giving_date: string | null;
}

export interface MemberPledge {
  id: string;
  pledge_amount: number;
  amount_paid: number;
  currency: string;
  pledge_date: string;
  due_date: string | null;
  is_fulfilled: boolean;
  notes: string | null;
  // joined from giving_categories
  category_name: string | null;
}

// ── Ministries ────────────────────────────────────────────────────────────────

// Replaces the old MemberMinistryInvolvement
export interface MemberMinistryAssignment {
  id: string;
  ministry_id: string;
  role: string | null;
  joined_date: string;
  is_active: boolean;
  // joined from ministries
  ministry_name: string;
  ministry_description: string | null;
  ministry_category: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_location: string | null;
  meeting_schedule: string | null;
}
