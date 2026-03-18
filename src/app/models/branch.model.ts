// src/app/models/branch.model.ts
export interface Branch {
  id: string;
  church_id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  pastor_name?: string;
  pastor_id?: string; // USING YOUR EXISTING FIELD
  is_active: boolean;
  member_count: number;
  established_date?: string;
  created_at: string;
  updated_at: string;

  // Relations
  pastor?: BranchPastor;
}

export interface BranchPastor {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  phone_number?: string;
}

// src/app/models/branch.model.ts (UPDATE this interface)
export interface BranchInsights {
  branch_id: string;
  branch_name: string;
  member_count: number;
  new_members_last_month: number;
  new_members_last_quarter: number;
  giving_last_month: number;
  giving_last_quarter: number;
  total_giving: number;
  transactions_last_month: number;
  unique_givers_last_month: number;
  total_attendance_last_month: number;
  services_last_month: number;
  total_attendance_last_quarter: number;
  avg_attendance_last_month: number;
  upcoming_events_30d: number;
  past_events_30d: number;
  growth_rate_monthly: number;
  growth_rate_quarterly: number;
  giving_participation_rate: number;
  last_updated: string;
}

export interface BranchMember {
  id: string;
  branch_id: string;
  member_id: string;
  assigned_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Relations (populated by joins)
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    email?: string;
    phone_primary?: string;
    photo_url?: string;
    member_number?: string;
  };
  branch?: Branch;
}

export interface BranchStatistics {
  total_branches: number;
  active_branches: number;
  inactive_branches: number;
  total_members: number;
  average_members: number;
  largest_branch?: {
    name: string;
    member_count: number;
  };
  smallest_branch?: {
    name: string;
    member_count: number;
  };
}

export interface BranchFormData {
  name: string;
  pastor_name?: string;
  pastor_id?: string; // USING YOUR EXISTING FIELD
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  established_date?: string;
}

export interface AssignBranchPastorRequest {
  user_id: string;
  branch_id: string;
  send_welcome_email: boolean;
}




