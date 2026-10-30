// src/app/models/church.model.ts
export interface Church {
  id: string;
  name: string;
  slug?: string;
  city?: string;
  country?: string;
  location?: string; // ✅ Added for signup process (combines city + country)
  size_category?: string; // ✅ Added for signup process
  contact_email?: string; // ✅ Added
  contact_phone?: string; // ✅ Added
  primary_color?: string;
  secondary_color?: string;
  timezone?: string;
  currency?: string;
  is_active: boolean;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  subscription_tier?: string;
  enabled_features?: string[];
  created_at?: string;
  updated_at?: string;
}









