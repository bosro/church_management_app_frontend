// src/app/models/church.model.ts
export interface Church {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  primary_color: string;
  secondary_color: string;
  timezone: string;
  currency: string;
  is_active: boolean;
  subscription_tier: string;
  created_at?: string;
}
