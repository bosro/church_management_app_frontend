// src/app/models/attendance.model.ts
export type AttendanceEventType =
  | 'sunday_service'
  | 'midweek_service'
  | 'ministry_meeting'
  | 'special_event'
  | 'prayer_meeting';

export type CheckInMethod = 'manual' | 'qr_code' | 'bulk' | 'self_service';

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
  check_in_method: CheckInMethod;
  notes?: string;

  // Relations
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    photo_url?: string;
    member_number: string;
  };
  visitor?: {
    id: string;
    first_name: string;
    last_name: string;
  };
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

export interface AttendanceStatistics {
  total_events: number;
  total_attendance: number;
  avg_attendance: number;
  highest_attendance: number;
  lowest_attendance: number;
  total_visitors: number;
  converted_visitors: number;
}

export interface AttendanceReportData {
  date: string;
  service_type: string;
  total_present: number;
  total_absent: number;
  total_members: number;
  attendance_rate: number;
}

export interface BulkCheckInResult {
  success: number;
  errors: string[];
  failed_members: string[];
}

export interface VisitorCheckInData {
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  address?: string;
  referred_by?: string;
  notes?: string;
}
