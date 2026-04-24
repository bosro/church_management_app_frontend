// src/app/features/my-giving/services/giving.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

import {
  GivingCategory,
  GivingTransaction,
  GivingSummary,
  CreateTransactionData,
} from '../../../models/giving.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root',
})
export class GivingService {
  private userId?: string;
  private memberId?: string;
  private churchId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {
    const profile = this.authService.currentProfile;
    this.userId = profile?.id;
    this.churchId = profile?.church_id;
  }

  private getMemberId(): Observable<string> {
    if (this.memberId) {
      return of(this.memberId);
    }
    return from(
      this.supabase.client
        .from('members')
        .select('id')
        .eq('user_id', this.userId)
        .single(),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        this.memberId = response.data.id;
        return this.memberId!;
      }),
      catchError(() =>
        throwError(
          () =>
            new Error(
              'Member record not found. Please contact your church admin.',
            ),
        ),
      ),
    );
  }

  getCategories(): Observable<GivingCategory[]> {
    return from(
      this.supabase.client
        .from('giving_categories')
        .select('*')
        .eq('is_active', true)
        .eq('church_id', this.churchId) // ← ADD THIS
        .order('name', { ascending: true }),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data || [];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  getMyGivingSummary(fiscalYear?: number): Observable<GivingSummary> {
    const year = fiscalYear || new Date().getFullYear();

    return this.getMemberId().pipe(
      switchMap((memberId) =>
        from(
          this.supabase.client.rpc('get_member_giving_summary', {
            member_uuid: memberId, // ✅ members.id not users.id
            fiscal_year: year,
          }),
        ),
      ),
      map((response) => {
        if (response.error) throw response.error;
        const data = Array.isArray(response.data)
          ? response.data[0]
          : response.data;
        return (
          data || {
            total_giving: 0,
            total_tithes: 0,
            total_offerings: 0,
            total_seeds: 0,
            total_transactions: 0,
            currency: 'GHS',
          }
        );
      }),
      catchError((err) => {
        console.error('Error fetching giving summary:', err);
        return throwError(() => err);
      }),
    );
  }

  getMyGivingHistory(limit: number = 50): Observable<GivingTransaction[]> {
    return this.getMemberId().pipe(
      switchMap((memberId) =>
        from(
          this.supabase.client
            .from('giving_transactions')
            .select(`*, category:giving_categories!category_id(name)`)
            .eq('member_id', memberId) // ✅ members.id
            .order('transaction_date', { ascending: false })
            .limit(limit),
        ),
      ),
      map((response) => {
        if (response.error) throw response.error;
        return (response.data || []).map((t: any) => ({
          ...t,
          category_name: t.category?.name || 'Unknown',
        }));
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  submitGiving(
    givingData: CreateTransactionData,
  ): Observable<GivingTransaction> {
    if (!this.userId || !this.churchId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return this.getMemberId().pipe(
      switchMap((memberId) => {
        const reference = this.generateTransactionReference();
        const notes = this.buildTransactionNotes(givingData);

        const transactionData = {
          church_id: this.churchId,
          member_id: memberId, // ✅ members.id
          category_id: givingData.category_id,
          amount: givingData.amount,
          currency: 'GHS',
          payment_method: givingData.payment_method,
          transaction_reference: reference,
          transaction_date:
            givingData.transaction_date ||
            new Date().toISOString().split('T')[0],
          fiscal_year: new Date().getFullYear(),
          notes: notes,
          recorded_by: this.userId, // ✅ users.id (auth UUID) not memberId
        };

        return from(
          this.supabase.client
            .from('giving_transactions')
            .insert(transactionData)
            .select(`*, category:giving_categories!category_id(name)`)
            .single(),
        ).pipe(
          map((response) => {
            if (response.error) throw response.error;
            const transaction = response.data as any;
            return {
              ...transaction,
              category_name: transaction.category?.name || 'Unknown',
            };
          }),
        );
      }),
      catchError((err) => {
        console.error('Error submitting giving:', err);
        return throwError(() => err);
      }),
    );
  }

  private generateTransactionReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  private buildTransactionNotes(data: CreateTransactionData): string {
    const notes: string[] = [];

    if (data.notes) notes.push(data.notes);

    switch (data.payment_method) {
      case 'mobile_money':
        if (data.mobile_number)
          notes.push(`Mobile Number: ${data.mobile_number}`);
        break;
      case 'bank_transfer':
        if (data.bank_name) notes.push(`Bank: ${data.bank_name}`);
        if (data.account_number) notes.push(`Account: ${data.account_number}`);
        break;
      case 'card':
        if (data.card_number)
          notes.push(`Card: ****${data.card_number.slice(-4)}`);
        break;
    }

    return notes.join(' | ');
  }
}
