// src/app/models/ministry.model.ts
export interface Ministry {
  id: string;
  church_id: string;
  branch_id?: string;
  name: string;
  description?: string;
  category?: string;
  leader_id?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
  meeting_schedule?: string;
  requirements?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;

  // Relations (populated by joins)
  leader?: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url?: string;
    phone_primary?: string;
    email?: string;
  };
  branch?: {
    id: string;
    name: string;
  };
}

export interface MinistryMember {
  id: string;
  ministry_id: string;
  member_id: string;
  role?: string | null;
  joined_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;

  // Relations (populated by joins)
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url?: string;
    member_number?: string;
    phone_primary?: string;
    email?: string;
  };
}

export interface MinistryLeader {
  id: string;
  ministry_id: string;
  member_id: string;
  position: string;
  start_date: string;
  end_date?: string | null;
  is_current: boolean;
  created_at?: string;
  updated_at?: string;

  // Relations (populated by joins)
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url?: string;
    member_number?: string;
    phone_primary?: string;
    email?: string;
  };
}

export interface MinistryFormData {
  name: string;
  description?: string;
  category?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
  meeting_schedule?: string;
  requirements?: string;
  leader_name?: string;
  leader_email?: string;
  leader_phone?: string;
  is_active?: boolean;
}

export interface MinistryStatistics {
  total_ministries: number;
  total_members: number;
  active_ministries: number;
  inactive_ministries: number;
  largest_ministry?: {
    id: string;
    name: string;
    member_count: number;
  };
  most_active_leaders: Array<{
    member_id: string;
    member_name: string;
    ministry_count: number;
  }>;
  recent_activity_count: number;
}

export const MINISTRY_CATEGORIES = [
  'Worship & Music',
  'Youth Ministry',
  'Children Ministry',
  "Men's Ministry",
  "Women's Ministry",
  'Outreach & Evangelism',
  'Prayer Ministry',
  'Media & Technology',
  'Hospitality',
  'Education',
  'Counseling',
  'Missions',
  'Administration',
  'Other'
] as const;

export type MinistryCategory = typeof MINISTRY_CATEGORIES[number];

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];
