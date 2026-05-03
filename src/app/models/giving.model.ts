// src/app/models/giving.model.ts
export type PaymentMethod =
  | 'cash'
  | 'mobile_money'
  | 'bank_transfer'
  | 'check'
  | 'cheque'
  | 'card'
  | 'online'
  | 'paystack';

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
  paystack_reference?: string;
  payment_status?: 'pending' | 'completed' | 'failed' | 'abandoned';
  payment_channel?: string;
  transaction_date: string;
  fiscal_year?: number;
  notes?: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
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
  avg_transaction?: number;
  last_giving_date?: string;
  currency: string;
}

export interface CreateTransactionData {
  category_id: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_date?: string;
  notes?: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  card_number?: string;
}

export interface CategoryGivingStat {
  category_id: string;
  category_name: string;
  total_amount: number;
  transaction_count: number;
  unique_givers: number;
  avg_amount: number;
  highest_amount: number;
  percentage_of_total: number;
}

export interface CategoryGiver {
  member_id: string | null;
  member_name: string;
  member_number: string;
  photo_url: string | null;
  total_amount: number;
  transaction_count: number;
  last_giving_date: string;
  is_visitor: boolean;
}

// ── NEW: added for category summary cards, bulk giving, and expenses ──

export interface CategorySummary {
  category_id: string;
  category_name: string;
  category_description?: string;
  total_giving: number;
  total_bulk_giving: number;
  total_expenses: number;
  net_balance: number;
  transaction_count: number;
  bulk_record_count: number;
  expense_count: number;
  last_transaction_date?: string;
}

export interface BulkGivingRecord {
  id: string;
  church_id: string;
  branch_id?: string;
  category_id: string;
  category_name?: string;
  total_amount: number;
  currency: string;
  payment_method: string;
  record_date: string;
  attendee_count?: number;
  description?: string;
  notes?: string;
  recorded_by: string;
  created_at?: string;
}

export interface CategoryExpense {
  id: string;
  church_id: string;
  branch_id?: string;
  category_id: string;
  category_name?: string;
  amount: number;
  currency: string;
  expense_date: string;
  title: string;
  description?: string;
  receipt_reference?: string;
  approved_by?: string;
  recorded_by: string;
  created_at?: string;
}
