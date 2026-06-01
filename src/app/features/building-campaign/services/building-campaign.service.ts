// src/app/features/building-campaign/services/building-campaign.service.ts

import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  BuildingCommitment,
  BuildingCommitmentPayment,
  BuildingCampaignStats,
  CreateCommitmentDto,
} from '../../../models/building-campaign.model';

@Injectable({ providedIn: 'root' })
export class BuildingCampaignService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private getChurchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found. Please log in again.');
    return id;
  }

  private getUserId(): string {
    const id = this.authService.getUserId();
    if (!id) throw new Error('User ID not found.');
    return id;
  }

  // ── Commitments ──────────────────────────────────────────────

  getCommitments(
    page = 1,
    pageSize = 20,
    filters?: {
      search?: string;
      isFulfilled?: boolean;
      frequency?: 'weekly' | 'monthly';
    },
  ): Observable<{ data: BuildingCommitment[]; count: number }> {
    return from(this.fetchCommitments(page, pageSize, filters));
  }

  private async fetchCommitments(
    page: number,
    pageSize: number,
    filters?: any,
  ): Promise<{ data: BuildingCommitment[]; count: number }> {
    const churchId = this.getChurchId();
    const offset = (page - 1) * pageSize;

    let query = this.supabase.client
      .from('building_commitments')
      .select(
        `*, member:members(id, first_name, last_name, member_number, photo_url)`,
        { count: 'exact' },
      )
      .eq('church_id', churchId);

    if (filters?.isFulfilled !== undefined)
      query = query.eq('is_fulfilled', filters.isFulfilled);
    if (filters?.frequency)
      query = query.eq('instalment_frequency', filters.frequency);
    if (filters?.search) {
      query = query.or(
        `visitor_name.ilike.%${filters.search}%,visitor_contact.ilike.%${filters.search}%`,
      );
    }

    const { data, error, count } = await query
      .order('submitted_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    return { data: (data || []) as BuildingCommitment[], count: count || 0 };
  }

  getCommitmentById(id: string): Observable<BuildingCommitment> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('building_commitments')
        .select(`*, member:members(id, first_name, last_name, member_number, photo_url)`)
        .eq('id', id)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as BuildingCommitment;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  createCommitment(dto: CreateCommitmentDto): Observable<BuildingCommitment> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('building_commitments')
        .insert({
          church_id: churchId,
          member_id: dto.member_id || null,
          visitor_name: dto.visitor_name || null,
          visitor_contact: dto.visitor_contact || null,
          total_pledge_amount: dto.total_pledge_amount,
          initial_payment: dto.initial_payment,
          instalment_frequency: dto.instalment_frequency,
          instalment_count: dto.instalment_count,
          currency: dto.currency,
          payment_method: dto.payment_method || null,
          campaign_name: dto.campaign_name || 'The Rich Church',
          notes: dto.notes || null,
          // Record initial payment as amount_paid if > 0
          amount_paid: dto.initial_payment,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as BuildingCommitment;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteCommitment(id: string): Observable<void> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('building_commitments')
        .delete()
        .eq('id', id)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Payments ─────────────────────────────────────────────────

  getPayments(commitmentId: string): Observable<BuildingCommitmentPayment[]> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('building_commitment_payments')
        .select('*')
        .eq('commitment_id', commitmentId)
        .eq('church_id', churchId)
        .order('payment_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as BuildingCommitmentPayment[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  recordPayment(
    commitmentId: string,
    payment: {
      amount: number;
      payment_date: string;
      payment_method?: string;
      reference?: string;
      notes?: string;
    },
  ): Observable<BuildingCommitmentPayment> {
    const churchId = this.getChurchId();
    const userId = this.getUserId();
    return from(
      this.supabase.client
        .from('building_commitment_payments')
        .insert({
          commitment_id: commitmentId,
          church_id: churchId,
          amount: payment.amount,
          currency: 'GHS',
          payment_date: payment.payment_date,
          payment_method: payment.payment_method || null,
          reference: payment.reference || null,
          notes: payment.notes || null,
          recorded_by: userId,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as BuildingCommitmentPayment;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deletePayment(paymentId: string): Observable<void> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('building_commitment_payments')
        .delete()
        .eq('id', paymentId)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Stats ─────────────────────────────────────────────────────

  getCampaignStats(): Observable<BuildingCampaignStats> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client.rpc('get_building_campaign_stats', {
        church_uuid: churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return row as BuildingCampaignStats;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Export ────────────────────────────────────────────────────

  exportCommitmentsCSV(commitments: BuildingCommitment[]): Blob {
    const headers = [
      'Name', 'Contact', 'Total Pledge', 'Initial Payment',
      'Remaining', 'Instalment', 'Frequency', 'Periods',
      'Amount Paid', 'Outstanding', 'Status', 'Payment Method', 'Date',
    ];
    const rows = commitments.map((c) => {
      const name = c.member
        ? `${c.member.first_name} ${c.member.last_name}`
        : c.visitor_name || 'N/A';
      const contact = c.member?.member_number || c.visitor_contact || 'N/A';
      return [
        name, contact,
        c.total_pledge_amount, c.initial_payment,
        c.remaining_amount, c.instalment_amount,
        c.instalment_frequency, c.instalment_count,
        c.amount_paid, c.total_pledge_amount - c.amount_paid,
        c.is_fulfilled ? 'Fulfilled' : 'Pending',
        c.payment_method || 'N/A',
        new Date(c.submitted_at).toLocaleDateString('en-GH'),
      ];
    });
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
    ].join('\n');
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }
}
