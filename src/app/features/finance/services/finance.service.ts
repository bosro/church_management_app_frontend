// src/app/features/finance/services/finance.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  GivingTransaction,
  GivingCategory,
  Pledge,
  PaymentMethod
} from '../../../models/giving.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface GivingStatistics {
  total_giving: number;
  total_tithes: number;
  total_offerings: number;
  total_transactions: number;
  avg_giving: number;
  highest_giving: number;
}

export interface TopGiver {
  member_id: string;
  member_name: string;
  total_amount: number;
  transaction_count: number;
}

export interface GivingTrend {
  month: string;
  total_amount: number;
  transaction_count: number;
}

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  private churchId?: string;
  private currentUserId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {
    this.churchId = this.authService.getChurchId();
    this.currentUserId = this.authService.getUserId();
  }

  // ==================== PERMISSIONS ====================

  canManageFinance(): boolean {
    const roles = ['super_admin', 'church_admin', 'finance_officer'];
    return this.authService.hasRole(roles);
  }

  canViewFinance(): boolean {
    const roles = ['super_admin', 'church_admin', 'finance_officer', 'pastor'];
    return this.authService.hasRole(roles);
  }

  canManageCategories(): boolean {
    const roles = ['super_admin', 'church_admin', 'finance_officer'];
    return this.authService.hasRole(roles);
  }

  // ==================== GIVING CATEGORIES ====================

  getGivingCategories(): Observable<GivingCategory[]> {
    return from(
      this.supabase.client
        .from('giving_categories')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as GivingCategory[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  createGivingCategory(categoryData: { name: string; description?: string }): Observable<GivingCategory> {
    return from(
      this.supabase.client
        .from('giving_categories')
        .insert({
          church_id: this.churchId,
          name: categoryData.name,
          description: categoryData.description,
          is_active: true
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as GivingCategory;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateGivingCategory(categoryId: string, categoryData: { name?: string; description?: string }): Observable<GivingCategory> {
    return from(
      this.supabase.client
        .from('giving_categories')
        .update({
          name: categoryData.name,
          description: categoryData.description
        })
        .eq('id', categoryId)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as GivingCategory;
      }),
      catchError(err => throwError(() => err))
    );
  }

  deleteGivingCategory(categoryId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('giving_categories')
        .update({ is_active: false })
        .eq('id', categoryId)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== GIVING TRANSACTIONS ====================

  getGivingTransactions(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      startDate?: string;
      endDate?: string;
      categoryId?: string;
      memberId?: string;
      paymentMethod?: PaymentMethod | '';
    }
  ): Observable<{ data: any[], count: number }> {
    return from(this.fetchGivingTransactions(page, pageSize, filters));
  }

  private async fetchGivingTransactions(
    page: number,
    pageSize: number,
    filters?: any
  ): Promise<{ data: any[], count: number }> {
    const offset = (page - 1) * pageSize;

    let query = this.supabase.client
      .from('giving_transactions')
      .select(`
        *,
        category:giving_categories(id, name),
        member:members(id, first_name, last_name, member_number, photo_url)
      `, { count: 'exact' })
      .eq('church_id', this.churchId);

    // Apply filters
    if (filters?.startDate) {
      query = query.gte('transaction_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('transaction_date', filters.endDate);
    }
    if (filters?.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters?.memberId) {
      query = query.eq('member_id', filters.memberId);
    }
    if (filters?.paymentMethod) {
      query = query.eq('payment_method', filters.paymentMethod);
    }

    query = query
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    return { data: data || [], count: count || 0 };
  }

  getGivingTransactionById(transactionId: string): Observable<any> {
    return from(
      this.supabase.client
        .from('giving_transactions')
        .select(`
          *,
          category:giving_categories(id, name),
          member:members(id, first_name, last_name, member_number, photo_url)
        `)
        .eq('id', transactionId)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
      catchError(err => throwError(() => err))
    );
  }

  createGivingTransaction(transactionData: any): Observable<GivingTransaction> {
    const currentYear = new Date(transactionData.transaction_date).getFullYear();

    return from(
      this.supabase.client
        .from('giving_transactions')
        .insert({
          church_id: this.churchId,
          member_id: transactionData.member_id || null,
          category_id: transactionData.category_id,
          amount: transactionData.amount,
          currency: transactionData.currency,
          payment_method: transactionData.payment_method,
          transaction_reference: transactionData.transaction_reference || null,
          transaction_date: transactionData.transaction_date,
          fiscal_year: currentYear,
          notes: transactionData.notes || null,
          recorded_by: this.currentUserId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as GivingTransaction;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateGivingTransaction(transactionId: string, transactionData: any): Observable<GivingTransaction> {
    return from(
      this.supabase.client
        .from('giving_transactions')
        .update({
          member_id: transactionData.member_id,
          category_id: transactionData.category_id,
          amount: transactionData.amount,
          currency: transactionData.currency,
          payment_method: transactionData.payment_method,
          transaction_reference: transactionData.transaction_reference,
          transaction_date: transactionData.transaction_date,
          notes: transactionData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as GivingTransaction;
      }),
      catchError(err => throwError(() => err))
    );
  }

  deleteGivingTransaction(transactionId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('giving_transactions')
        .delete()
        .eq('id', transactionId)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== PLEDGES ====================

  getPledges(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      memberId?: string;
      categoryId?: string;
      isFulfilled?: boolean;
    }
  ): Observable<{ data: any[], count: number }> {
    return from(this.fetchPledges(page, pageSize, filters));
  }

  private async fetchPledges(
    page: number,
    pageSize: number,
    filters?: any
  ): Promise<{ data: any[], count: number }> {
    const offset = (page - 1) * pageSize;

    let query = this.supabase.client
      .from('pledges')
      .select(`
        *,
        category:giving_categories(id, name),
        member:members(id, first_name, last_name, member_number, photo_url)
      `, { count: 'exact' })
      .eq('church_id', this.churchId);

    if (filters?.memberId) {
      query = query.eq('member_id', filters.memberId);
    }
    if (filters?.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters?.isFulfilled !== undefined) {
      query = query.eq('is_fulfilled', filters.isFulfilled);
    }

    query = query
      .order('pledge_date', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    return { data: data || [], count: count || 0 };
  }

  createPledge(pledgeData: any): Observable<Pledge> {
    return from(
      this.supabase.client
        .from('pledges')
        .insert({
          church_id: this.churchId,
          member_id: pledgeData.member_id,
          category_id: pledgeData.category_id || null,
          pledge_amount: pledgeData.pledge_amount,
          amount_paid: 0,
          currency: pledgeData.currency,
          pledge_date: pledgeData.pledge_date,
          due_date: pledgeData.due_date || null,
          is_fulfilled: false,
          notes: pledgeData.notes || null
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Pledge;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updatePledge(pledgeId: string, pledgeData: any): Observable<Pledge> {
    return from(
      this.supabase.client
        .from('pledges')
        .update({
          pledge_amount: pledgeData.pledge_amount,
          amount_paid: pledgeData.amount_paid,
          currency: pledgeData.currency,
          pledge_date: pledgeData.pledge_date,
          due_date: pledgeData.due_date,
          is_fulfilled: pledgeData.is_fulfilled,
          notes: pledgeData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', pledgeId)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Pledge;
      }),
      catchError(err => throwError(() => err))
    );
  }

  recordPledgePayment(pledgeId: string, amount: number): Observable<Pledge> {
    return from(this.processePledgePayment(pledgeId, amount));
  }

  private async processePledgePayment(pledgeId: string, amount: number): Promise<Pledge> {
    // Get current pledge
    const { data: pledge, error: fetchError } = await this.supabase.client
      .from('pledges')
      .select('*')
      .eq('id', pledgeId)
      .eq('church_id', this.churchId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!pledge) throw new Error('Pledge not found');

    const newAmountPaid = pledge.amount_paid + amount;
    const isFulfilled = newAmountPaid >= pledge.pledge_amount;

    // Update pledge
    const { data: updatedPledge, error: updateError } = await this.supabase.client
      .from('pledges')
      .update({
        amount_paid: newAmountPaid,
        is_fulfilled: isFulfilled,
        updated_at: new Date().toISOString()
      })
      .eq('id', pledgeId)
      .eq('church_id', this.churchId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);
    return updatedPledge as Pledge;
  }

  deletePledge(pledgeId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('pledges')
        .delete()
        .eq('id', pledgeId)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== STATISTICS & REPORTS ====================

  getGivingStatistics(fiscalYear?: number): Observable<GivingStatistics> {
    const year = fiscalYear || new Date().getFullYear();

    return from(
      this.supabase.client
        .rpc('get_giving_stats', {
          church_uuid: this.churchId,
          fiscal_year: year
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as GivingStatistics;
      }),
      catchError(err => throwError(() => err))
    );
  }

  getGivingTrends(monthsBack: number = 12): Observable<GivingTrend[]> {
    return from(
      this.supabase.client
        .rpc('get_giving_trends', {
          church_uuid: this.churchId,
          months_back: monthsBack
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as GivingTrend[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  getTopGivers(limit: number = 10, fiscalYear?: number): Observable<TopGiver[]> {
    const year = fiscalYear || new Date().getFullYear();

    return from(
      this.supabase.client
        .rpc('get_top_givers', {
          church_uuid: this.churchId,
          fiscal_year: year,
          result_limit: limit
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as TopGiver[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  getMemberGivingHistory(memberId: string, fiscalYear?: number): Observable<any> {
    const year = fiscalYear || new Date().getFullYear();

    return from(
      this.supabase.client
        .rpc('get_member_giving_summary', {
          member_uuid: memberId,
          fiscal_year: year
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== EXPORTS ====================

  exportGivingReport(
    startDate: string,
    endDate: string,
    categoryId?: string
  ): Observable<Blob> {
    const filters = { startDate, endDate, categoryId };

    return this.getGivingTransactions(1, 10000, filters).pipe(
      map(({ data }) => {
        const headers = [
          'Date', 'Member', 'Member Number', 'Category', 'Amount',
          'Currency', 'Payment Method', 'Reference', 'Notes'
        ];

        const rows = data.map((transaction: any) => [
          transaction.transaction_date,
          transaction.member
            ? `${transaction.member.first_name} ${transaction.member.last_name}`
            : 'Anonymous',
          transaction.member?.member_number || 'N/A',
          transaction.category?.name || 'General',
          transaction.amount,
          transaction.currency,
          transaction.payment_method,
          transaction.transaction_reference || '',
          transaction.notes || ''
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      })
    );
  }

  exportPledgesReport(): Observable<Blob> {
    return this.getPledges(1, 10000).pipe(
      map(({ data }) => {
        const headers = [
          'Member', 'Category', 'Pledge Amount', 'Amount Paid',
          'Balance', 'Currency', 'Pledge Date', 'Due Date', 'Status'
        ];

        const rows = data.map((pledge: any) => {
          const balance = pledge.pledge_amount - pledge.amount_paid;
          return [
            `${pledge.member.first_name} ${pledge.member.last_name}`,
            pledge.category?.name || 'General',
            pledge.pledge_amount,
            pledge.amount_paid,
            balance,
            pledge.currency,
            pledge.pledge_date,
            pledge.due_date || 'N/A',
            pledge.is_fulfilled ? 'Fulfilled' : 'Pending'
          ];
        });

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      })
    );
  }
}
