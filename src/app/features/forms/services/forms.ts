// src/app/features/forms/services/forms.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { FormTemplate, FormSubmission, SubmissionStatus } from '../../../models/form.model';
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

  // FORM TEMPLATES CRUD
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
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as FormTemplate[], count: count || 0 };
      })()
    );
  }

  getFormTemplateById(templateId: string): Observable<FormTemplate> {
    return from(
      this.supabase.query<FormTemplate>('form_templates', {
        filters: { id: templateId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Form template not found');
        return data[0];
      })
    );
  }

  createFormTemplate(templateData: Partial<FormTemplate>): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<FormTemplate>('form_templates', {
        ...templateData,
        church_id: churchId,
        created_by: userId,
        is_active: true
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateFormTemplate(
    templateId: string,
    templateData: Partial<FormTemplate>
  ): Observable<FormTemplate> {
    return from(
      this.supabase.update<FormTemplate>('form_templates', templateId, templateData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteFormTemplate(templateId: string): Observable<void> {
    return from(
      this.supabase.update<FormTemplate>('form_templates', templateId, { is_active: false })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // FORM SUBMISSIONS
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
            member:members(id, first_name, last_name, email, phone_primary)
          `, { count: 'exact' })
          .eq('form_template_id', templateId)
          .order('submitted_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as FormSubmission[], count: count || 0 };
      })()
    );
  }

  submitForm(
    templateId: string,
    submissionData: Record<string, any>,
    memberId?: string
  ): Observable<FormSubmission> {
    return from(
      this.supabase.insert<FormSubmission>('form_submissions', {
        form_template_id: templateId,
       member_id: memberId ?? undefined,
        submission_data: submissionData,
        status: 'submitted'
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus
): Observable<FormSubmission> {
    return from(
      this.supabase.update<FormSubmission>('form_submissions', submissionId, { status })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteSubmission(submissionId: string): Observable<void> {
    return from(
      this.supabase.delete('form_submissions', submissionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // EXPORT
  exportSubmissions(templateId: string): Observable<Blob> {
    return this.getFormSubmissions(templateId, 1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) {
          throw new Error('No submissions to export');
        }

        // Get all unique field keys from submissions
        const allKeys = new Set<string>();
        data.forEach(submission => {
          Object.keys(submission.submission_data).forEach(key => allKeys.add(key));
        });

        const headers = ['Submitted At', 'Status', 'Member', ...Array.from(allKeys)];

        const rows = data.map(submission => {
          const memberName = submission.member
            ? `${submission.member.first_name} ${submission.member.last_name}`
            : 'Guest';

          const row = [
            new Date(submission.submitted_at).toLocaleString(),
            submission.status,
            memberName
          ];

          // Add submission data values
          allKeys.forEach(key => {
            const value = submission.submission_data[key];
            row.push(Array.isArray(value) ? value.join(', ') : value || '');
          });

          return row;
        });

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      })
    );
  }
}
