// src/app/features/finance/services/finance.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  GivingTransaction,
  GivingCategory,
  Pledge,
  PaymentMethod
} from '../../../models/giving.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // GIVING CATEGORIES
  getGivingCategories(): Observable<GivingCategory[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.query<GivingCategory>('giving_categories', {
        filters: { church_id: churchId, is_active: true },
        order: { column: 'name', ascending: true }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
    );
  }

  createGivingCategory(categoryData: Partial<GivingCategory>): Observable<GivingCategory> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<GivingCategory>('giving_categories', {
        ...categoryData,
        church_id: churchId,
        is_active: true
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateGivingCategory(categoryId: string, categoryData: Partial<GivingCategory>): Observable<GivingCategory> {
    return from(
      this.supabase.update<GivingCategory>('giving_categories', categoryId, categoryData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteGivingCategory(categoryId: string): Observable<void> {
    return from(
      this.supabase.update<GivingCategory>('giving_categories', categoryId, { is_active: false })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // GIVING TRANSACTIONS
  getGivingTransactions(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      startDate?: string;
      endDate?: string;
      categoryId?: string;
      memberId?: string;
      paymentMethod?: PaymentMethod;
    }
  ): Observable<{ data: GivingTransaction[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('giving_transactions')
          .select(`
            *,
            category:giving_categories(id, name),
            member:members(id, first_name, last_name, member_number, photo_url)
          `, { count: 'exact' })
          .eq('church_id', churchId);

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

        if (error) throw error;

        return { data: data as any[], count: count || 0 };
      })()
    );
  }

  getGivingTransactionById(transactionId: string): Observable<GivingTransaction> {
    return from(
      this.supabase.client
        .from('giving_transactions')
        .select(`
          *,
          category:giving_categories(id, name),
          member:members(id, first_name, last_name, member_number, photo_url)
        `)
        .eq('id', transactionId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as any;
      })
    );
  }

  createGivingTransaction(transactionData: Partial<GivingTransaction>): Observable<GivingTransaction> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.currentProfile?.id;
    const currentYear = new Date().getFullYear();

    return from(
      this.supabase.insert<GivingTransaction>('giving_transactions', {
        ...transactionData,
        church_id: churchId,
        recorded_by: userId,
        fiscal_year: currentYear
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateGivingTransaction(transactionId: string, transactionData: Partial<GivingTransaction>): Observable<GivingTransaction> {
    return from(
      this.supabase.update<GivingTransaction>('giving_transactions', transactionId, transactionData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteGivingTransaction(transactionId: string): Observable<void> {
    return from(
      this.supabase.delete('giving_transactions', transactionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // PLEDGES
  getPledges(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      memberId?: string;
      categoryId?: string;
      isFulfilled?: boolean;
    }
  ): Observable<{ data: Pledge[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('pledges')
          .select(`
            *,
            category:giving_categories(id, name),
            member:members(id, first_name, last_name, member_number, photo_url)
          `, { count: 'exact' })
          .eq('church_id', churchId);

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

        if (error) throw error;

        return { data: data as any[], count: count || 0 };
      })()
    );
  }

  createPledge(pledgeData: Partial<Pledge>): Observable<Pledge> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<Pledge>('pledges', {
        ...pledgeData,
        church_id: churchId,
        amount_paid: 0,
        is_fulfilled: false
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updatePledge(pledgeId: string, pledgeData: Partial<Pledge>): Observable<Pledge> {
    return from(
      this.supabase.update<Pledge>('pledges', pledgeId, pledgeData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  recordPledgePayment(pledgeId: string, amount: number): Observable<Pledge> {
    return from(
      (async () => {
        // Get current pledge
        const { data: pledge } = await this.supabase.query<Pledge>('pledges', {
          filters: { id: pledgeId },
          limit: 1
        });

        if (!pledge || pledge.length === 0) {
          throw new Error('Pledge not found');
        }

        const currentPledge = pledge[0];
        const newAmountPaid = currentPledge.amount_paid + amount;
        const isFulfilled = newAmountPaid >= currentPledge.pledge_amount;

        // Update pledge
        const { data: updatedPledge, error } = await this.supabase.update<Pledge>(
          'pledges',
          pledgeId,
          {
            amount_paid: newAmountPaid,
            is_fulfilled: isFulfilled
          }
        );

        if (error) throw error;
        return updatedPledge![0];
      })()
    );
  }

  deletePledge(pledgeId: string): Observable<void> {
    return from(
      this.supabase.delete('pledges', pledgeId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // STATISTICS & REPORTS
  getGivingStatistics(fiscalYear?: number): Observable<any> {
    const churchId = this.authService.getChurchId();
    const year = fiscalYear || new Date().getFullYear();

    return from(
      this.supabase.callFunction('get_giving_stats', {
        church_uuid: churchId,
        fiscal_year: year
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }

  getGivingTrends(monthsBack: number = 12): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.callFunction('get_giving_trends', {
        church_uuid: churchId,
        months_back: monthsBack
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }

  getTopGivers(limit: number = 10, fiscalYear?: number): Observable<any[]> {
    const churchId = this.authService.getChurchId();
    const year = fiscalYear || new Date().getFullYear();

    return from(
      this.supabase.client
        .rpc('get_top_givers', {
          church_uuid: churchId,
          fiscal_year: year,
          result_limit: limit
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
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
        if (error) throw error;
        return data;
      })
    );
  }

  // EXPORTS
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
          transaction.category?.name || 'N/A',
          transaction.amount,
          transaction.currency,
          transaction.payment_method,
          transaction.transaction_reference || '',
          transaction.notes || ''
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
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
          ...rows.map(row => row.join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      })
    );
  }

  // BULK IMPORT
  importGivingTransactions(file: File): Observable<{ success: number, errors: string[] }> {
    return from(
      (async () => {
        const text = await file.text();
        const rows = text.split('\n').slice(1); // Skip header

        let success = 0;
        const errors: string[] = [];

        for (const row of rows) {
          if (!row.trim()) continue;

          const columns = row.split(',').map(col => col.trim());

          try {
            const transactionData: Partial<GivingTransaction> = {
              transaction_date: columns[0],
              amount: parseFloat(columns[1]),
              currency: columns[2] || 'GHS',
              payment_method: (columns[3] as PaymentMethod) || 'cash',
              notes: columns[4] || undefined
            };

            await this.createGivingTransaction(transactionData).toPromise();
            success++;
          } catch (error: any) {
            errors.push(`Row ${success + errors.length + 2}: ${error.message}`);
          }
        }

        return { success, errors };
      })()
    );
  }
}
