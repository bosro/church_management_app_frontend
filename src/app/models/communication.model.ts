// src/app/models/communication.model.ts
export type CommunicationType = 'sms' | 'email' | 'both';
export type CommunicationStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
export type TargetAudience = 'all' | 'members' | 'groups' | 'custom';

export interface Communication {
  id: string;
  church_id: string;
  title: string;
  message: string;
  communication_type: CommunicationType;
  target_audience: TargetAudience;
  status: CommunicationStatus;
  scheduled_at?: string;
  sent_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Computed fields
  recipient_count?: number;
  sent_count?: number;
  failed_count?: number;
}

export interface SmsLog {
  id: string;
  church_id: string;
  communication_id?: string;
  member_id?: string;
  phone_number: string;
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  sent_at: string;
  delivered_at?: string;
  error_message?: string;

  // Relations
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    phone_primary: string;
  };
}

export interface EmailLog {
  id: string;
  church_id: string;
  communication_id?: string;
  member_id?: string;
  email_address: string;
  subject: string;
  message: string;
  status: 'sent' | 'delivered' | 'opened' | 'failed' | 'pending';
  sent_at: string;
  opened_at?: string;
  error_message?: string;

  // Relations
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface CommunicationStatistics {
  total_communications: number;
  total_sms: number;
  total_emails: number;
  sent_communications: number;
  failed_communications: number;
  pending_communications: number;
}
