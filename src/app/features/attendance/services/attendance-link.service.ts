// src/app/features/attendance/services/attendance-link.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export interface AttendanceLink {
  id: string;
  church_id: string;
  branch_id?: string;
  attendance_event_id: string;
  link_token: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceLinkValidation {
  valid: boolean;
  reason?: string;
  link?: AttendanceLink;
}

@Injectable({ providedIn: 'root' })
export class AttendanceLinkService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ── Get all links for an event ──────────────────────────────────
  getLinksForEvent(eventId: string): Observable<AttendanceLink[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('attendance_links')
        .select('*')
        .eq('attendance_event_id', eventId)
        .eq('church_id', churchId)
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as AttendanceLink[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Create a link for an event ──────────────────────────────────
  createLink(
    eventId: string,
    options: {
      expires_in_hours: number | null;
      max_uses: number | null;
    },
  ): Observable<AttendanceLink> {
    const churchId = this.authService.getChurchId();
    const branchId = this.authService.getBranchId();
    const userId = this.authService.getUserId();
    const token = this.generateToken();

    const expiresAt = options.expires_in_hours
      ? new Date(Date.now() + options.expires_in_hours * 60 * 60 * 1000).toISOString()
      : null;

    return from(
      this.supabase.client
        .from('attendance_links')
        .insert({
          church_id: churchId,
          branch_id: branchId || null,
          attendance_event_id: eventId,
          link_token: token,
          is_active: true,
          expires_at: expiresAt,
          max_uses: options.max_uses || null,
          current_uses: 0,
          created_by: userId,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as AttendanceLink;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Toggle active state ─────────────────────────────────────────
  setActive(linkId: string, active: boolean): Observable<void> {
    return from(
      this.supabase.client
        .from('attendance_links')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', linkId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Delete a link ───────────────────────────────────────────────
  deleteLink(linkId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('attendance_links')
        .delete()
        .eq('id', linkId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Public: validate a token ────────────────────────────────────
  validateToken(token: string): Observable<AttendanceLinkValidation> {
    return from(
      this.supabase.client
        .from('attendance_links')
        .select('*')
        .eq('link_token', token)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) {
          return { valid: false, reason: 'Link not found' };
        }

        const link = data as AttendanceLink;

        if (!link.is_active) {
          return { valid: false, reason: 'This link has been deactivated', link };
        }

        if (link.expires_at && new Date(link.expires_at) < new Date()) {
          return { valid: false, reason: 'This link has expired', link };
        }

        if (link.max_uses !== null && link.current_uses >= link.max_uses) {
          return { valid: false, reason: 'This link has reached its maximum uses', link };
        }

        return { valid: true, link };
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Public: increment uses after successful check-in ───────────
  incrementUses(linkId: string, currentUses: number): Observable<void> {
    return from(
      this.supabase.client
        .from('attendance_links')
        .update({ current_uses: currentUses + 1, updated_at: new Date().toISOString() })
        .eq('id', linkId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── URL helpers ─────────────────────────────────────────────────
  getLinkUrl(token: string): string {
    return `${window.location.origin}/attendance/link-checkin/${token}`;
  }

  isExpired(link: AttendanceLink): boolean {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  }

  isMaxedOut(link: AttendanceLink): boolean {
    return link.max_uses !== null && link.current_uses >= link.max_uses;
  }

  getLinkStatus(link: AttendanceLink): string {
    if (this.isExpired(link)) return 'Expired';
    if (this.isMaxedOut(link)) return 'Max Uses Reached';
    if (!link.is_active) return 'Deactivated';
    return 'Active';
  }

  getStatusClass(link: AttendanceLink): string {
    if (this.isExpired(link)) return 'status-expired';
    if (this.isMaxedOut(link)) return 'status-maxed';
    if (!link.is_active) return 'status-inactive';
    return 'status-active';
  }

  formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return 'Never';
    return new Date(expiresAt).toLocaleString();
  }

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 40; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
}
