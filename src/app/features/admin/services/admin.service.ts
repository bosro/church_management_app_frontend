import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Church } from '../../../models/church.model';
import { SignupRequest, User } from '../../../models/user.model';
import { SupabaseService } from '../../../core/services/supabase';

export interface UserWithChurch extends User {
  church?: Church;
}

export interface ApprovalStats {
  total_pending: number;
  total_approved: number;
  total_rejected: number;
  pending_this_week: number;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get all users (super admin only)
   */
  getAllUsers(): Observable<UserWithChurch[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select(
          `
          *,
          church:churches(*)
        `,
        )
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as UserWithChurch[];
      }),
    );
  }

  /**
   * Get all churches (super admin only)
   */
  getAllChurches(): Observable<Church[]> {
    return from(
      this.supabase.client
        .from('churches')
        .select('*')
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Church[];
      }),
    );
  }

  /**
   * Get pending signup requests
   */
  getPendingSignupRequests(): Observable<SignupRequest[]> {
    return from(
      this.supabase.client
        .from('signup_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SignupRequest[];
      }),
    );
  }

  /**
   * Get all signup requests (with filters)
   */
  getSignupRequests(status?: string): Observable<SignupRequest[]> {
    let query = this.supabase.client
      .from('signup_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SignupRequest[];
      }),
    );
  }

  /**
   * Approve signup request
   */
  approveSignupRequest(
    requestId: string,
    churchId?: string,
    adminId?: string,
  ): Observable<any> {
    return from(
      this.supabase.callFunction('approve_signup_request', {
        p_request_id: requestId,
        p_admin_id: adminId,
        p_church_id: churchId || null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  /**
   * Reject signup request
   */
  rejectSignupRequest(
    requestId: string,
    reason: string,
    adminId?: string,
  ): Observable<any> {
    return from(
      this.supabase.callFunction('reject_signup_request', {
        p_request_id: requestId,
        p_admin_id: adminId,
        p_reason: reason || null,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  /**
   * Toggle user active status
   */
  toggleUserStatus(userId: string, isActive: boolean): Observable<any> {
    return from(
      this.supabase.update('profiles', userId, { is_active: isActive }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  /**
   * Update user role
   */
  updateUserRole(userId: string, role: string): Observable<any> {
    return from(this.supabase.update('profiles', userId, { role })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  /**
   * Get approval statistics
   */
  getApprovalStats(): Observable<ApprovalStats> {
    return from(
      this.supabase.client.from('signup_requests').select('status, created_at'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        const requests = data || [];
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        return {
          total_pending: requests.filter((r) => r.status === 'pending').length,
          total_approved: requests.filter((r) => r.status === 'approved')
            .length,
          total_rejected: requests.filter((r) => r.status === 'rejected')
            .length,
          pending_this_week: requests.filter(
            (r) =>
              r.status === 'pending' && new Date(r.created_at) >= oneWeekAgo,
          ).length,
        };
      }),
    );
  }

  /**
   * Create new church
   */
  createChurch(churchData: Partial<Church>): Observable<Church> {
    return from(this.supabase.insert('churches', churchData)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data?.[0] as Church;
      }),
    );
  }

  /**
   * Update user church assignment
   */
  updateUserChurch(userId: string, churchId: string | null): Observable<any> {
    return from(
      this.supabase.update('profiles', userId, { church_id: churchId }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }
  /**
   * Update church
   */
  updateChurch(
    churchId: string,
    churchData: Partial<Church>,
  ): Observable<Church> {
    return from(this.supabase.update('churches', churchId, churchData)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data?.[0] as Church;
      }),
    );
  }

  /**
   * Delete church (soft delete by setting is_active = false)
   */
  deleteChurch(churchId: string): Observable<any> {
    return this.updateChurch(churchId, { is_active: false });
  }

  clearUserPermissions(userId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .delete()
        .eq('user_id', userId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  /**
 * Get all churches with subscription info and usage
 */
getAllChurchesWithSubscription(): Observable<any[]> {
  return from(
    this.supabase.client
      .from('churches')
      .select(`
        id, name, location, is_active, created_at,
        subscription_plan, subscription_tier,
        subscription_expires_at, subscription_started_at,
        billing_email, payment_reference,
        contact_email, size_category
      `)
      .order('created_at', { ascending: false }),
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      return data || [];
    }),
  );
}

/**
 * Update church subscription (super admin only)
 */
updateChurchSubscription(
  churchId: string,
  planId: string,
  durationMonths: number,
  paymentReference: string,
  billingEmail?: string,
): Observable<void> {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

  return from(
    this.supabase.client
      .from('churches')
      .update({
        subscription_plan: planId,
        subscription_tier: planId === 'pro' ? 'premium' : planId,
        subscription_expires_at: planId === 'free'
          ? null
          : expiresAt.toISOString(),
        subscription_started_at: new Date().toISOString(),
        subscription_renewed_at: new Date().toISOString(),
        payment_reference: paymentReference || null,
        billing_email: billingEmail || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', churchId),
  ).pipe(
    map(({ error }) => {
      if (error) throw new Error(error.message);
    }),
  );
}

/**
 * Get usage for a specific church
 */
getChurchUsage(churchId: string): Observable<any> {
  return from(
    this.supabase.client.rpc('get_church_usage', {
      p_church_id: churchId,
    }),
  ).pipe(
    map(({ data, error }) => {
      if (error) throw error;
      return data;
    }),
  );
}
}
