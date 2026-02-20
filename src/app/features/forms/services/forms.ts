// src/app/features/forms/services/forms.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { FormTemplate, FormSubmission, SubmissionStatus, FormStatistics } from '../../../models/form.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class FormsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // ==================== PERMISSIONS ====================

  canManageForms(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewForms(): boolean {
    return true;
  }

  canSubmitForms(): boolean {
    return true;
  }

  // ==================== FORM TEMPLATES CRUD ====================

  getFormTemplates(
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ data: FormTemplate[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('form_templates')
          .select(`
            *,
            submission_count:form_submissions(count)
          `, { count: 'exact' })
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        const templates = (data || []).map((template: any) => ({
          ...template,
          submission_count: template.submission_count?.[0]?.count || 0
        }));

        return { data: templates as FormTemplate[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading form templates:', err);
        return throwError(() => err);
      })
    );
  }

  getFormTemplateById(templateId: string): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.query<FormTemplate>('form_templates', {
        filters: { id: templateId, church_id: churchId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Form template not found');
        return data[0];
      }),
      catchError(err => {
        console.error('Error loading form template:', err);
        return throwError(() => err);
      })
    );
  }

  createFormTemplate(templateData: {
    title: string;
    description?: string;
    form_fields: any[];
  }): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<FormTemplate>('form_templates', {
        church_id: churchId,
        title: templateData.title,
        description: templateData.description || null,
        form_fields: templateData.form_fields,
        created_by: userId,
        is_active: true
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create form template');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating form template:', err);
        return throwError(() => err);
      })
    );
  }

  updateFormTemplate(
    templateId: string,
    templateData: {
      title?: string;
      description?: string;
      form_fields?: any[];
      is_active?: boolean;
    }
  ): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('form_templates')
          .select('id')
          .eq('id', templateId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Form template not found or access denied');
        }

        return this.supabase.update<FormTemplate>('form_templates', templateId, {
          ...templateData,
          updated_at: new Date().toISOString()
        });
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update form template');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating form template:', err);
        return throwError(() => err);
      })
    );
  }

  deleteFormTemplate(templateId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('form_templates')
          .select('id')
          .eq('id', templateId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Form template not found or access denied');
        }

        return this.supabase.update<FormTemplate>('form_templates', templateId, {
          is_active: false,
          updated_at: new Date().toISOString()
        });
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting form template:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== FORM SUBMISSIONS ====================

  getFormSubmissions(
    templateId: string,
    page: number = 1,
    pageSize: number = 50
  ): Observable<{ data: FormSubmission[], count: number }> {
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('form_submissions')
          .select(`
            *,
            member:members(id, first_name, last_name, email, phone_primary, member_number, photo_url)
          `, { count: 'exact' })
          .eq('form_id', templateId)  // Changed from form_template_id to form_id
          .order('submitted_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        // Add default status since it's not in the database
        const submissions = (data || []).map((sub: any) => ({
          ...sub,
          status: 'submitted' as SubmissionStatus  // Default status
        }));

        return { data: submissions, count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading form submissions:', err);
        return throwError(() => err);
      })
    );
  }

  submitForm(
    templateId: string,
    submissionData: Record<string, any>,
    memberId?: string
  ): Observable<FormSubmission> {
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<FormSubmission>('form_submissions', {
        form_id: templateId,  // Changed from form_template_id to form_id
        member_id: memberId || userId,
        submission_data: submissionData,
        submitted_at: new Date().toISOString()
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to submit form');
        return { ...data[0], status: 'submitted' as SubmissionStatus };
      }),
      catchError(err => {
        console.error('Error submitting form:', err);
        return throwError(() => err);
      })
    );
  }

  updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus
  ): Observable<FormSubmission> {
    // Since status is not in the database, we'll store it in local state
    // or you can add a metadata JSONB column to store extra info
    console.warn('Status updates are not persisted in the database');

    return from(
      this.supabase.client
        .from('form_submissions')
        .select('*')
        .eq('id', submissionId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return { ...data, status } as FormSubmission;
      }),
      catchError(err => {
        console.error('Error updating submission status:', err);
        return throwError(() => err);
      })
    );
  }

  deleteSubmission(submissionId: string): Observable<void> {
    return from(
      this.supabase.delete('form_submissions', submissionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting submission:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== EXPORT ====================

  exportSubmissions(templateId: string): Observable<Blob> {
    return this.getFormSubmissions(templateId, 1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) {
          throw new Error('No submissions to export');
        }

        const allKeys = new Set<string>();
        data.forEach(submission => {
          Object.keys(submission.submission_data).forEach(key => allKeys.add(key));
        });

        const headers = ['Submitted At', 'Member', 'IP Address', ...Array.from(allKeys)];

        const rows = data.map((submission: any) => {
          const memberName = submission.member
            ? `${submission.member.first_name} ${submission.member.last_name}`
            : 'Guest';

          const row = [
            new Date(submission.submitted_at).toLocaleString(),
            memberName,
            submission.ip_address || 'N/A'
          ];

          allKeys.forEach(key => {
            const value = submission.submission_data[key];
            row.push(Array.isArray(value) ? value.join('; ') : (value || ''));
          });

          return row;
        });

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError(err => {
        console.error('Error exporting submissions:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== STATISTICS ====================

  getFormStatistics(templateId: string): Observable<FormStatistics> {
    return this.getFormSubmissions(templateId, 1, 10000).pipe(
      map(({ data }) => {
        // Since status is not in DB, all submissions are "submitted"
        return {
          total_submissions: data.length,
          pending_submissions: data.length,
          reviewed_submissions: 0,
          approved_submissions: 0,
          rejected_submissions: 0
        };
      })
    );
  }
}
