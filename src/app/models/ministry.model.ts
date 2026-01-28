// src/app/models/ministry.model.ts
export interface Ministry {
  id: string;
  church_id: string;
  branch_id?: string;
  name: string;
  description?: string;
  leader_id?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number
}

export interface MemberMinistryMap {
  id: string;
  ministry_id: string;
  member_id: string;
  role: string;
  joined_at: string;
}



export interface MinistryMember {
  id: string;
  ministry_id: string;
  member_id: string;
  role?: string | null;
  joined_date: string;
  is_active: boolean;
}

export interface MinistryLeader {
  id: string;
  ministry_id: string;
  member_id: string;
  position: string;
  start_date: string;
  end_date?: string | null;
  is_current: boolean;
}
