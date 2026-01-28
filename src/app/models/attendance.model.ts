// src/app/models/attendance.model.ts
export type AttendanceEventType =
  | 'sunday_service'
  | 'midweek_service'
  | 'ministry_meeting'
  | 'special_event'
  | 'prayer_meeting';

export interface AttendanceEvent {
  id: string;
  church_id: string;
  branch_id?: string;
  ministry_id?: string;
  event_type: AttendanceEventType;
  event_name: string;
  event_date: string;
  event_time?: string;
  location?: string;
  expected_attendance?: number;
  total_attendance: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  attendance_event_id: string;
  member_id?: string;
  visitor_id?: string;
  checked_in_at: string;
  checked_in_by?: string;
  check_in_method: string;
  notes?: string;
}

export interface Visitor {
  id: string;
  church_id: string;
  branch_id?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  address?: string;
  first_visit_date: string;
  last_visit_date?: string;
  visit_count: number;
  referred_by?: string;
  is_converted_to_member: boolean;
  member_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
