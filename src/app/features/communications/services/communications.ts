// src/app/features/communications/services/communications.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface Communication {
  id: string;
  church_id: string;
  title: string;
  message: string;
  communication_type: 'sms' | 'email' | 'both';
  target_audience: 'all' | 'members' | 'groups' | 'custom';
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_at?: string;
  sent_at?: string;
  created_by: string;
  created_at: string;

  // Computed fields
  recipient_count?: number;
  sent_count?: number;
  failed_count?: number;
}

@Injectable({
  providedIn: 'root'
})
export class CommunicationsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // COMMUNICATIONS CRUD
  getCommunications(
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ data: Communication[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('communications')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Communication[], count: count || 0 };
      })()
    );
  }

  getCommunicationById(communicationId: string): Observable<Communication> {
    return from(
      this.supabase.query<Communication>('communications', {
        filters: { id: communicationId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Communication not found');
        return data[0];
      })
    );
  }

  createCommunication(communicationData: Partial<Communication>): Observable<Communication> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<Communication>('communications', {
        ...communicationData,
        church_id: churchId,
        created_by: userId,
        status: 'draft'
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateCommunication(
    communicationId: string,
    communicationData: Partial<Communication>
  ): Observable<Communication> {
    return from(
      this.supabase.update<Communication>('communications', communicationId, communicationData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteCommunication(communicationId: string): Observable<void> {
    return from(
      this.supabase.delete('communications', communicationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // SEND COMMUNICATIONS
  sendCommunication(communicationId: string): Observable<any> {
    return from(
      (async () => {
        // In a real implementation, this would trigger the backend to send messages
        // For now, we'll just update the status
        const { data, error } = await this.supabase.update<Communication>(
          'communications',
          communicationId,
          {
            status: 'sent',
            sent_at: new Date().toISOString()
          }
        );

        if (error) throw error;
        return data![0];
      })()
    );
  }

  // SMS LOGS
  getSmsLogs(page: number = 1, pageSize: number = 50): Observable<{ data: any[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('sms_logs')
          .select(`
            *,
            member:members(id, first_name, last_name, phone_primary)
          `, { count: 'exact' })
          .eq('church_id', churchId)
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data || [], count: count || 0 };
      })()
    );
  }

  // EMAIL LOGS
  getEmailLogs(page: number = 1, pageSize: number = 50): Observable<{ data: any[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('email_logs')
          .select(`
            *,
            member:members(id, first_name, last_name, email)
          `, { count: 'exact' })
          .eq('church_id', churchId)
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data || [], count: count || 0 };
      })()
    );
  }

  // STATISTICS
  getCommunicationStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { count: totalCommunications } = await this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        const { count: totalSms } = await this.supabase.client
          .from('sms_logs')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        const { count: totalEmails } = await this.supabase.client
          .from('email_logs')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        const { count: sentCommunications } = await this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('status', 'sent');

        return {
          total_communications: totalCommunications || 0,
          total_sms: totalSms || 0,
          total_emails: totalEmails || 0,
          sent_communications: sentCommunications || 0
        };
      })()
    );
  }
}
