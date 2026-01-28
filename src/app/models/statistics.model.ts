// src/app/models/statistics.model.ts
export interface MembershipStats {
  total_members: number;
  active_members: number;
  new_members_this_month: number;
  new_members_this_year: number;
  male_members: number;
  female_members: number;
  avg_age: number;
}

export interface AttendanceStats {
  total_events: number;
  total_attendance: number;
  avg_attendance: number;
  highest_attendance: number;
  lowest_attendance: number;
}

export interface GivingStats {
  total_giving: number;
  total_transactions: number;
  avg_transaction: number;
  total_tithes: number;
  total_offerings: number;
  top_month: string;
  top_month_amount: number;
}

export interface DashboardSummary {
  church_id: string;
  church_name: string;
  active_members: number;
  new_members_this_month: number;
  new_members_this_year: number;
  attendance_this_month: number;
  giving_this_month: number;
  giving_this_year: number;
  upcoming_events: number;
  active_ministries: number;
  recent_visitors: number;
  last_refreshed: string;
}
