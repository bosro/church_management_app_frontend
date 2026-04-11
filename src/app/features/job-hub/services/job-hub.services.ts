// src/app/features/job-hub/services/job-hub.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { JobPost, JobPostFormData } from '../../../models/job.model';

@Injectable({ providedIn: 'root' })
export class JobHubService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId() { return this.authService.getChurchId(); }
 private get userId() { return this.authService.getUserId(); }

  getJobs(activeOnly = true): Observable<{ data: JobPost[]; count: number }> {
    return from(
      (async () => {
        let query = this.supabase.client
          .from('job_posts')
          .select('*', { count: 'exact' })
          .eq('church_id', this.churchId)
          .order('created_at', { ascending: false });

        if (activeOnly) {
          query = query.eq('is_active', true);
        }

        const { data, error, count } = await query;
        if (error) throw new Error(error.message);

        return {
          data: (data || []).map(j => this.enrichJob(j)),
          count: count || 0
        };
      })()
    ).pipe(catchError(err => throwError(() => err)));
  }

  getJobById(id: string): Observable<JobPost> {
    return from(
      this.supabase.client
        .from('job_posts')
        .select('*')
        .eq('id', id)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichJob(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  createJob(formData: JobPostFormData): Observable<JobPost> {
    return from(
      this.supabase.client
        .from('job_posts')
        .insert({
          ...formData,
          church_id: this.churchId,
          posted_by: this.userId,
          is_active: true,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichJob(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateJob(id: string, formData: Partial<JobPostFormData>): Observable<JobPost> {
    return from(
      this.supabase.client
        .from('job_posts')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichJob(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  deleteJob(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('job_posts')
        .delete()
        .eq('id', id)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  toggleJobStatus(id: string, isActive: boolean): Observable<void> {
    return from(
      this.supabase.client
        .from('job_posts')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  private enrichJob(j: any): JobPost {
    const now = new Date();
    const expires = j.expires_at ? new Date(j.expires_at) : null;
    const isExpired = expires ? now > expires : false;
    const daysRemaining = expires
      ? Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return { ...j, is_expired: isExpired, days_remaining: daysRemaining };
  }
}
