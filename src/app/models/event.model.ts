// src/app/models/event.model.ts
export type EventCategory =
  | 'service'
  | 'meeting'
  | 'conference'
  | 'seminar'
  | 'retreat'
  | 'workshop'
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
  requires_registration?: boolean;
  event_type?: EventCategory;
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

export interface EventRegistration {
  id: string;
  event_id: string;
  member_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  checked_in: boolean;
  checked_in_at?: string;
  registered_at: string;
}
