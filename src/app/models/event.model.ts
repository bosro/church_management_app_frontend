// src/app/models/event.model.ts
export type EventCategory =
  | 'service'
  | 'conference'
  | 'seminar'
  | 'retreat'
  | 'outreach'
  | 'social'
  | 'youth'
  | 'children'
  | 'other';

export interface Event {
  id: string;
  church_id: string;
  branch_id?: string;
  title: string;
  description?: string;
  category?: EventCategory;
  start_date: string;
  end_date?: string;
  location?: string;
  banner_url?: string;
  max_attendees?: number;
  registration_required: boolean;
  registration_deadline?: string;
  is_public: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EventAttendee {
  id: string;
  event_id: string;
  member_id?: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  rsvp_status: string;
  attended: boolean;
  registered_at: string;
}
