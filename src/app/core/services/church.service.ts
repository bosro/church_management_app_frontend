// src/app/core/services/church.service.ts (create if doesn't exist)
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase';
import { Church } from '../../models/church.model';

@Injectable({
  providedIn: 'root',
})
export class ChurchService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get all churches for signup dropdown
   */
  getAllChurches(): Observable<Church[]> {
    return from(this.loadActiveChurches());
  }

  /** Only ACTIVE churches are offered at signup. */
  private async loadActiveChurches(): Promise<Church[]> {
    const { data, error } = await this.supabase.client.rpc('get_signup_churches');
    if (!error) return (data || []) as Church[];

    // Fallback if the database function is not installed yet:
    // still never list a deactivated church.
    const res = await this.supabase.client
      .from('churches')
      .select('id, name, location')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []) as Church[];
  }

  /**
   * Check if email exists in a specific church
   */
  checkEmailExistsInChurch(
    email: string,
    churchId: string,
  ): Observable<{
    has_auth_account: boolean;
    has_user_record: boolean;
  } | null> {
    return from(
      this.supabase.callFunction('check_email_exists_in_church', {
        p_email: email,
        p_church_id: churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return null;
        return data as { has_auth_account: boolean; has_user_record: boolean };
      }),
      catchError(() => from([null])),
    );
  }
}







