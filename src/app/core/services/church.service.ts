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
    return from(
      this.supabase.query<Church>('churches', {
        select: 'id, name, location',
        order: { column: 'name', ascending: true },
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
    );
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





