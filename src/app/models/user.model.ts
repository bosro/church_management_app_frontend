// src/app/models/user.model.ts
export type UserRole = 'super_admin' | 'church_admin' | 'pastor' | 'finance_officer' | 'group_leader' | 'member';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  avatar_url?: string;
  role: UserRole;
  church_id?: string;
  branch_id?: string;
  is_active: boolean;

  // Approval fields
  approval_status?: ApprovalStatus;
  approved_by?: string;
  approved_at?: string;

  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  session: any;
}

export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  church_name: string;
  church_location: string;
  position: string;
  phone: string;
  church_size: string;
  how_heard: string;
}

// Signup Request Model
export interface SignupRequest {
  id: string;
  user_id: string;
  profile_id?: string;
  church_id?: string;
  full_name: string;
  email: string;
  phone?: string;
  position?: string;
  church_name?: string;
  church_location?: string;
  church_size?: string;
  how_heard?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}
