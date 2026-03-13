// src/app/models/giving.model.ts
export type PaymentMethod =
  | 'cash'
  | 'mobile_money'
  | 'bank_transfer'
  | 'check'
  | 'cheque'
  | 'card'
  | 'online';

export interface GivingCategory {
  id: string;
  church_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface GivingTransaction {
  id: string;
  church_id: string;
  branch_id?: string;
  member_id?: string;
  category_id: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  transaction_reference?: string;
  transaction_date: string;
  fiscal_year?: number;
  notes?: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;

  // Joined fields (from queries)
  category_name?: string;
  member_name?: string;
}

export interface Pledge {
  id: string;
  church_id: string;
  member_id?: string;
  category_id?: string;
  pledge_amount: number;
  amount_paid: number;
  currency: string;
  pledge_date: string;
  due_date?: string;
  is_fulfilled: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;

  // Visitor info (direct columns in your DB)
  visitor_first_name?: string;
  visitor_last_name?: string;
  visitor_phone?: string;
  visitor_email?: string;

  // Joined fields
  category_name?: string;
  member_name?: string;
}

export interface PledgePayment {
  id: string;
  pledge_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface GivingSummary {
  total_giving: number;
  total_tithes: number;
  total_offerings: number;
  total_seeds: number;
  total_transactions: number;
  currency: string;
}

export interface CreateTransactionData {
  category_id: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_date?: string;
  notes?: string;
  // Payment details to be added to notes
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  card_number?: string;
}





