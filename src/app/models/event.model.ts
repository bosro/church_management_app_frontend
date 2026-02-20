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

export interface ChurchEvent {  // Changed from Event to ChurchEvent
  id: string;
  church_id: string;
  branch_id?: string;
  title: string;
  description?: string;
  category: EventCategory;
  start_date: string;
  end_date?: string;
  location?: string;
  banner_url?: string;
  max_attendees?: number;
  registration_required: boolean;  // Standardized to registration_required
  registration_deadline?: string;
  is_public: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
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

  // Relations
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url?: string;
    member_number: string;
    email?: string;
    phone_primary?: string;
  };
}

export interface EventStatistics {
  total_registrations: number;
  checked_in: number;
  confirmed: number;
  pending: number;
  cancelled: number;
}
