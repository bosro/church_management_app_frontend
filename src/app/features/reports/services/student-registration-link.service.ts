// src/app/features/reports/services/student-registration-link.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface StudentRegistrationLink {
  id: string;
  church_id: string;
  link_token: string;
  class_id: string | null;
  class_name?: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateStudentLinkInput {
  expires_in_hours: number | null;
  max_uses: number | null;
  class_id?: string | null; // Optional: restrict link to a specific class
}

@Injectable({ providedIn: 'root' })
export class StudentRegistrationLinkService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId(): string {
    return this.authService.getChurchId() || '';
  }

  private generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  createLink(input: CreateStudentLinkInput): Observable<StudentRegistrationLink> {
    let expiresAt: string | null = null;
    if (input.expires_in_hours !== null) {
      const d = new Date();
      d.setHours(d.getHours() + input.expires_in_hours);
      expiresAt = d.toISOString();
    }

    const insertData: any = {
      church_id: this.churchId,
      created_by: this.authService.getUserId(),
      link_token: this.generateToken(),
      expires_at: expiresAt,
      class_id: input.class_id || null,
      is_active: true,
      current_uses: 0,
    };

    if (input.max_uses !== null) {
      insertData.max_uses = input.max_uses;
    }

    return from(
      this.supabase.client
        .from('student_registration_links')
        .insert(insertData)
        .select('*, class:school_classes!student_registration_links_class_id_fkey(name, academic_year)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Failed to create registration link');
        return {
          ...data,
          class_name: (data as any).class?.name,
        } as StudentRegistrationLink;
      }),
      catchError((error) => {
        console.error('Create student registration link error:', error);
        return throwError(() => new Error(error.message || 'Failed to create link'));
      }),
    );
  }

  getLinks(): Observable<StudentRegistrationLink[]> {
    return from(
      this.supabase.client
        .from('student_registration_links')
        .select('*, class:school_classes(name, academic_year)')
        .eq('church_id', this.churchId)
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((link: any) => ({
          ...link,
          class_name: link.class?.name,
        })) as StudentRegistrationLink[];
      }),
    );
  }

  deactivateLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('student_registration_links')
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
        .from('student_registration_links')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  deleteLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('student_registration_links')
        .delete()
        .eq('id', linkId)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    );
  }

  // ── Public methods (no auth) ──────────────────────────────────────────────

  validateLink(token: string): Observable<any> {
    return from(
      this.supabase.client.rpc('validate_student_registration_link', {
        link_token_param: token,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  submitRegistration(token: string, studentData: any): Observable<any> {
    return from(
      this.supabase.client.rpc('submit_public_student_registration', {
        p_link_token: token,
        p_student_data: studentData,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    );
  }

  getRegistrationUrl(token: string): string {
    return `${window.location.origin}/public/student-register/${token}`;
  }
}
