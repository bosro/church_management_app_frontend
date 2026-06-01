// src/app/models/building-campaign.model.ts

export interface BuildingCommitment {
  id: string;
  church_id: string;

  // Pledger identity
  member_id?: string;
  visitor_name?: string;
  visitor_contact?: string;

  // Amounts
  total_pledge_amount: number;
  initial_payment: number;
  remaining_amount: number;        // generated column
  instalment_frequency: 'weekly' | 'monthly';
  instalment_count: number;
  instalment_amount: number;       // generated column

  currency: string;
  payment_method?: string;

  // Tracking
  amount_paid: number;
  is_fulfilled: boolean;

  campaign_name: string;
  notes?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;

  // Joined
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    member_number: string;
    photo_url?: string;
  };
}

export interface BuildingCommitmentPayment {
  id: string;
  commitment_id: string;
  church_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method?: string;
  reference?: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface BuildingCampaignStats {
  total_commitments: number;
  total_pledged: number;
  total_collected: number;
  total_outstanding: number;
  fulfilled_count: number;
  member_commitments: number;
  visitor_commitments: number;
  weekly_commitments: number;
  monthly_commitments: number;
}

export interface CreateCommitmentDto {
  // Identity (one of these required)
  member_id?: string;
  visitor_name?: string;
  visitor_contact?: string;

  total_pledge_amount: number;
  initial_payment: number;
  instalment_frequency: 'weekly' | 'monthly';
  instalment_count: number;
  currency: string;
  payment_method?: string;
  campaign_name?: string;
  notes?: string;
}
