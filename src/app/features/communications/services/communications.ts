// src/app/features/communications/services/communications.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  Communication,
  CommunicationType,
  CommunicationStatus,
  TargetAudience,
  SmsLog,
  EmailLog,
  CommunicationStatistics
} from '../../../models/communication.model';

@Injectable({
  providedIn: 'root'
})
export class CommunicationsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // ==================== PERMISSIONS ====================

  canManageCommunications(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewCommunications(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'];
    return this.authService.hasRole(roles);
  }

  canSendCommunications(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor'];
    return this.authService.hasRole(roles);
  }

  // ==================== COMMUNICATIONS CRUD ====================

  getCommunications(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      status?: CommunicationStatus;
      type?: CommunicationType;
    }
  ): Observable<{ data: Communication[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('communications')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.type) {
          query = query.eq('communication_type', filters.type);
        }

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as Communication[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading communications:', err);
        return throwError(() => err);
      })
    );
  }

  getCommunicationById(communicationId: string): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('communications')
        .select('*')
        .eq('id', communicationId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Communication not found');
        return data as Communication;
      }),
      catchError(err => {
        console.error('Error loading communication:', err);
        return throwError(() => err);
      })
    );
  }

  createCommunication(communicationData: {
    title: string;
    message: string;
    communication_type: CommunicationType;
    target_audience: TargetAudience;
    scheduled_at?: string;
  }): Observable<Communication> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<Communication>('communications', {
        church_id: churchId,
        title: communicationData.title.trim(),
        message: communicationData.message.trim(),
        communication_type: communicationData.communication_type,
        target_audience: communicationData.target_audience,
        scheduled_at: communicationData.scheduled_at || null,
        status: communicationData.scheduled_at ? 'scheduled' : 'draft',
        created_by: userId
      } as any)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create communication');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating communication:', err);
        return throwError(() => err);
      })
    );
  }

  updateCommunication(
    communicationId: string,
    communicationData: Partial<Communication>
  ): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('communications')
          .select('id, status')
          .eq('id', communicationId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Communication not found or access denied');
        }

        // Don't allow editing sent communications
        if (existing.status === 'sent') {
          throw new Error('Cannot edit a sent communication');
        }

        const updateData = {
          ...communicationData,
          updated_at: new Date().toISOString()
        };

        return this.supabase.update<Communication>('communications', communicationId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update communication');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating communication:', err);
        return throwError(() => err);
      })
    );
  }

  deleteCommunication(communicationId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership and status
        const { data: existing } = await this.supabase.client
          .from('communications')
          .select('id, status')
          .eq('id', communicationId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Communication not found or access denied');
        }

        // Don't allow deleting sent communications
        if (existing.status === 'sent') {
          throw new Error('Cannot delete a sent communication');
        }

        return this.supabase.delete('communications', communicationId);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting communication:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== SEND COMMUNICATIONS ====================

  sendCommunication(communicationId: string): Observable<Communication> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership and status
        const { data: communication } = await this.supabase.client
          .from('communications')
          .select('*')
          .eq('id', communicationId)
          .eq('church_id', churchId)
          .single();

        if (!communication) {
          throw new Error('Communication not found or access denied');
        }

        if (communication.status === 'sent') {
          throw new Error('Communication already sent');
        }

        // Update status to sending
        await this.supabase.update<Communication>(
          'communications',
          communicationId,
          { status: 'sending' }
        );

        // In a real implementation, this would trigger the backend to send messages
        // via an edge function or webhook
        // For now, we'll simulate by updating status to sent
        const { data, error } = await this.supabase.update<Communication>(
          'communications',
          communicationId,
          {
            status: 'sent',
            sent_at: new Date().toISOString()
          }
        );

        if (error) throw new Error(error.message);
        return data![0];
      })()
    ).pipe(
      catchError(err => {
        console.error('Error sending communication:', err);
        // Update status back to draft on error
        this.updateCommunication(communicationId, { status: 'draft' }).subscribe();
        return throwError(() => err);
      })
    );
  }

  // ==================== SMS LOGS ====================

  getSmsLogs(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      status?: string;
      communicationId?: string;
    }
  ): Observable<{ data: SmsLog[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('sms_logs')
          .select(`
            *,
            member:members(id, first_name, last_name, phone_primary)
          `, { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.communicationId) {
          query = query.eq('communication_id', filters.communicationId);
        }

        const { data, error, count } = await query
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as SmsLog[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading SMS logs:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== EMAIL LOGS ====================

  getEmailLogs(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      status?: string;
      communicationId?: string;
    }
  ): Observable<{ data: EmailLog[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('email_logs')
          .select(`
            *,
            member:members(id, first_name, last_name, email)
          `, { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.communicationId) {
          query = query.eq('communication_id', filters.communicationId);
        }

        const { data, error, count } = await query
          .order('sent_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as EmailLog[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading email logs:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== STATISTICS ====================

  getCommunicationStatistics(): Observable<CommunicationStatistics> {
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

        const { count: failedCommunications } = await this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('status', 'failed');

        const { count: pendingCommunications } = await this.supabase.client
          .from('communications')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .in('status', ['draft', 'scheduled']);

        return {
          total_communications: totalCommunications || 0,
          total_sms: totalSms || 0,
          total_emails: totalEmails || 0,
          sent_communications: sentCommunications || 0,
          failed_communications: failedCommunications || 0,
          pending_communications: pendingCommunications || 0
        };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== HELPER METHODS ====================

  validatePhoneNumber(phone: string): boolean {
    // Basic phone validation (customize based on your region)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  estimateSmsCount(message: string): number {
    const length = message.length;
    if (length === 0) return 0;
    if (length <= 160) return 1;
    return Math.ceil(length / 153); // 153 chars per segment for multi-part SMS
  }
}
