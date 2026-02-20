// src/app/models/branch.model.ts
export interface Branch {
  id: string;
  church_id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  pastor_name?: string;
  is_active: boolean;
  member_count: number;
  established_date?: string;
  created_at: string;
  updated_at: string;
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
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  established_date?: string;
}
