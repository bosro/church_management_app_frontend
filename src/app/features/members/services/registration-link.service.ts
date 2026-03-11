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
  expires_at: string;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  registration_data?: any;
  created_by?: string; // ← Add this
  created_at: string;
  updated_at?: string; // ← Also add this for completeness
}

export interface CreateLinkInput {
  expires_in_hours: number;
  max_uses?: number;
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

  // Generate unique token
  private generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Create registration link (used by component)
  createLink(input: CreateLinkInput): Observable<RegistrationLink> {
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + input.expires_in_hours);

    return this.createRegistrationLink({
      expires_at: expiresAt.toISOString(),
      max_uses: input.max_uses || null,
    });
  }

  // Internal method to create registration link
  private createRegistrationLink(linkData: {
    expires_at: string;
    max_uses?: number | null;
    registration_data?: any;
  }): Observable<RegistrationLink> {
    // ✅ FIXED: Generate token in TypeScript instead of relying on database DEFAULT
    const insertData: any = {
      church_id: this.authService.getChurchId()!,
      created_by: this.authService.getUserId(),
      link_token: this.generateToken(), // ✅ Use the existing generateToken method!
      expires_at: linkData.expires_at,
      is_active: true,
      current_uses: 0,
    };

    // Only add optional fields if they have values
    if (linkData.max_uses !== null && linkData.max_uses !== undefined) {
      insertData.max_uses = linkData.max_uses;
    }

    if (linkData.registration_data) {
      insertData.registration_data = linkData.registration_data;
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

  // Get all links for current church
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

  // Deactivate link
  deactivateLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('registration_links')
        .update({ is_active: false })
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // Validate link (public - no auth)
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

  // Get full registration URL
  getRegistrationUrl(token: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/register/${token}`;
  }
}
