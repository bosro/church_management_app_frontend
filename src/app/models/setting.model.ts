// src/app/models/settings.model.ts
export type SettingCategory =
  | 'general'
  | 'notifications'
  | 'finance'
  | 'communications'
  | 'security';

export interface ChurchSetting {
  id: string;
  church_id: string;
  setting_key: string;
  setting_value: any;
  category: SettingCategory;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface Church {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  website?: string;
  logo_url?: string;
  timezone?: string;
  currency?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ChurchUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  website?: string;
  logo_url?: string;
  timezone?: string;
  currency?: string;
  description?: string;
}

export interface NotificationSettings {
  email_notifications: boolean;
  sms_notifications: boolean;
  event_reminders: boolean;
  new_member_alerts: boolean;
  donation_receipts: boolean;
}

export interface FinanceSettings {
  online_giving: boolean;
  recurring_donations: boolean;
  auto_generate_receipts: boolean;
  tax_deductible_receipts: boolean;
}

export interface CommunicationSettings {
  email_campaigns: boolean;
  sms_campaigns: boolean;
  automated_welcome_emails: boolean;
  birthday_greetings: boolean;
}

export interface SecuritySettings {
  two_factor_authentication: boolean;
  session_timeout: boolean;
  login_notifications: boolean;
  data_export: boolean;
}

export interface SettingsState {
  notifications: NotificationSettings;
  finance: FinanceSettings;
  communications: CommunicationSettings;
  security: SecuritySettings;
}

// Default settings
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  email_notifications: true,
  sms_notifications: false,
  event_reminders: true,
  new_member_alerts: true,
  donation_receipts: true
};

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  online_giving: true,
  recurring_donations: true,
  auto_generate_receipts: true,
  tax_deductible_receipts: false
};

export const DEFAULT_COMMUNICATION_SETTINGS: CommunicationSettings = {
  email_campaigns: true,
  sms_campaigns: true,
  automated_welcome_emails: true,
  birthday_greetings: true
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  two_factor_authentication: false,
  session_timeout: true,
  login_notifications: true,
  data_export: true
};

// Timezone options
export const TIMEZONES = [
  { value: 'Africa/Accra', label: 'Africa/Accra (GMT)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT)' },
  { value: 'America/New_York', label: 'America/New York (EST)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEDT)' }
];

// Currency options
export const CURRENCIES = [
  { value: 'GHS', label: 'GHS - Ghanaian Cedi', symbol: '₵' },
  { value: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { value: 'NGN', label: 'NGN - Nigerian Naira', symbol: '₦' },
  { value: 'KES', label: 'KES - Kenyan Shilling', symbol: 'KSh' },
  { value: 'ZAR', label: 'ZAR - South African Rand', symbol: 'R' }
];
