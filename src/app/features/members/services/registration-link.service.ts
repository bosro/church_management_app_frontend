// src/app/features/members/services/registration-link.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface RegistrationLink {
  id: string;
  church_id: string;
  link_token: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  registration_data?: any;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateLinkInput {
  expires_in_hours: number | null;
  max_uses: number | null;
}

export interface UpdateLinkInput {
  expires_at?: string | null; // ISO string or null
  max_uses?: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class RegistrationLinkService {
  private churchId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {
    this.churchId = this.authService.getChurchId();
  }

  private generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  createLink(input: CreateLinkInput): Observable<RegistrationLink> {
    let expiresAt: string | null = null;
    if (input.expires_in_hours !== null) {
      const d = new Date();
      d.setHours(d.getHours() + input.expires_in_hours);
      expiresAt = d.toISOString();
    }

    const insertData: any = {
      church_id: this.authService.getChurchId()!,
      created_by: this.authService.getUserId(),
      link_token: this.generateToken(),
      expires_at: expiresAt,
      is_active: true,
      current_uses: 0,
    };

    if (input.max_uses !== null) {
      insertData.max_uses = input.max_uses;
    }

    return from(
      this.supabase.insert<RegistrationLink>('registration_links', insertData),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Failed to create registration link');
        }
        return data[0];
      }),
      catchError((error) => {
        console.error('Create registration link error:', error);
        return throwError(
          () => new Error('Failed to create registration link'),
        );
      }),
    );
  }

  getLinks(): Observable<RegistrationLink[]> {
    return from(
      this.supabase.client
        .from('registration_links')
        .select('*')
        .eq('church_id', this.churchId)
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as RegistrationLink[];
      }),
    );
  }

  // ── NEW: Update an existing link ───────────────────────────
  updateLink(
    linkId: string,
    input: UpdateLinkInput,
  ): Observable<RegistrationLink> {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.expires_at !== undefined) updateData.expires_at = input.expires_at;
    if (input.max_uses !== undefined) updateData.max_uses = input.max_uses;

    return from(
      this.supabase.client
        .from('registration_links')
        .update(updateData)
        .eq('id', linkId)
        .eq('church_id', this.churchId)
        .select('*')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Failed to update link');
        return data as RegistrationLink;
      }),
    );
  }

  deactivateLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('registration_links')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  reactivateLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('registration_links')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // ── NEW: Permanent delete ─────────────────────────────────
  deleteLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('registration_links')
        .delete()
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  validateLink(token: string): Observable<any> {
    return from(
      this.supabase.client.rpc('use_registration_link', {
        link_token_param: token,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  getRegistrationUrl(token: string): string {
    return `${window.location.origin}/public/register/${token}`;
  }
}
