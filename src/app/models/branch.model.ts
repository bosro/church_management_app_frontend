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

  // Relations
  member?: any;
  branch?: Branch;
}
