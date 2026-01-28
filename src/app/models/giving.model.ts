// src/app/models/giving.model.ts
export type PaymentMethod =
  | 'cash'
  | 'mobile_money'
  | 'bank_transfer'
  | 'check'
  | 'card'
  | 'online'
   | 'cheque';

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
}

export interface Pledge {
  id: string;
  church_id: string;
  member_id: string;
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
}
