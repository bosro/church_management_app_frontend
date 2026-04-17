// src/app/features/forms/services/forms.service.ts
// KEY FIXES:
// 1. canManageForms() now also checks PermissionService grants — a user granted
//    forms.manage permission in user-roles will now be recognized
// 2. getFormSubmissions() branch pastor filter fixed — 'members.branch_id'
//    PostgREST syntax doesn't work for join-column filtering; replaced with
//    a two-step approach that actually scopes correctly
// 3. deleteSubmission() now verifies the submission belongs to the current
//    church before deleting (previously had no ownership check)
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  FormTemplate,
  FormSubmission,
  SubmissionStatus,
  FormStatistics,
} from '../../../models/form.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { PermissionService } from '../../../core/services/permission.service';
import { SubscriptionService } from '../../../core/services/subscription.service';

@Injectable({
  providedIn: 'root',
})
export class FormsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private permissionService: PermissionService,
    private subscriptionService: SubscriptionService,
  ) {}

  // ==================== PERMISSIONS ====================
  // FIX: Now checks BOTH role AND explicitly granted permissions.
  // Previously only checked roles via hasRole(), which meant a user granted
  // forms.manage via the user-roles system was still blocked.

  canManageForms(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return (
      this.permissionService.isAdmin ||
      (this.permissionService.forms as any)?.manage ||
      (this.permissionService.forms?.view === true &&
        this.authService.hasRole(roles)) ||
      this.authService.hasRole(roles)
    );
  }

  canViewForms(): boolean {
    // All authenticated users can view forms
    return true;
  }

  canSubmitForms(): boolean {
    // All authenticated users can submit forms
    return true;
  }

  // ==================== FORM TEMPLATES CRUD ====================

  getFormTemplates(
    page: number = 1,
    pageSize: number = 20,
  ): Observable<{ data: FormTemplate[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('form_templates')
          .select(`*, submission_count:form_submissions(count)`, {
            count: 'exact',
          })
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        const templates = (data || []).map((template: any) => ({
          ...template,
          submission_count: template.submission_count?.[0]?.count || 0,
        }));

        return { data: templates as FormTemplate[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getFormTemplateById(templateId: string): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.query<FormTemplate>('form_templates', {
        filters: { id: templateId, church_id: churchId },
        limit: 1,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Form template not found');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  createFormTemplate(templateData: {
    title: string;
    description?: string;
    form_fields: any[];
  }): Observable<FormTemplate> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return this.subscriptionService.checkQuota('forms').pipe(
      switchMap((quota) => {
        if (!quota.allowed) {
          throw new Error(
            `QUOTA_EXCEEDED:forms:${quota.current}:${quota.limit}`,
          );
        }
        return from(
          this.supabase.insert<FormTemplate>('form_templates', {
            church_id: churchId,
            title: templateData.title,
            description: templateData.description || null,
            form_fields: templateData.form_fields,
            created_by: userId,
            is_active: true,
          }),
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to create form template');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  updateFormTemplate(
    templateId: string,
    templateData: {
      title?: string;
      description?: string;
      form_fields?: any[];
      is_active?: boolean;
    },
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

        if (!existing)
          throw new Error('Form template not found or access denied');

        return this.supabase.update<FormTemplate>(
          'form_templates',
          templateId,
          {
            ...templateData,
            updated_at: new Date().toISOString(),
          },
        );
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to update form template');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
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

        if (!existing)
          throw new Error('Form template not found or access denied');

        return this.supabase.update<FormTemplate>(
          'form_templates',
          templateId,
          {
            is_active: false,
            updated_at: new Date().toISOString(),
          },
        );
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== FORM SUBMISSIONS ====================

  getFormSubmissions(
    templateId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Observable<{ data: FormSubmission[]; count: number }> {
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        // FIX: Branch pastor filtering via join column 'members.branch_id'
        // does NOT work in PostgREST/Supabase — it silently returns all rows.
        // Fixed: if branch pastor, first get their branch member IDs, then
        // filter submissions by those member IDs.
        let memberIdFilter: string[] | null = null;

        if (isBranchPastor && branchId) {
          const { data: branchMembers } = await this.supabase.client
            .from('members')
            .select('id')
            .eq('branch_id', branchId);

          memberIdFilter = (branchMembers || []).map((m: any) => m.id);

          // If branch has no members, return empty result immediately
          if (memberIdFilter.length === 0) {
            return { data: [], count: 0 };
          }
        }

        let query = this.supabase.client
          .from('form_submissions')
          .select(
            `*, member:members(id, first_name, last_name, email,
              phone_primary, member_number, photo_url)`,
            { count: 'exact' },
          )
          .eq('form_id', templateId)
          .order('submitted_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (memberIdFilter) {
          query = query.in('member_id', memberIdFilter);
        }

        const { data, error, count } = await query;
        if (error) throw new Error(error.message);

        const submissions = (data || []).map((sub: any) => ({
          ...sub,
          status: 'submitted' as SubmissionStatus,
        }));

        return { data: submissions, count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  submitForm(
    templateId: string,
    submissionData: Record<string, any>,
    memberId?: string,
  ): Observable<FormSubmission> {
    // NOTE: If memberId is not explicitly passed, the current user's userId
    // is used. When an admin fills out a form on behalf of a member, pass
    // the member's ID explicitly to avoid assigning the admin's ID.
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<FormSubmission>('form_submissions', {
        form_id: templateId,
        member_id: memberId || userId,
        submission_data: submissionData,
        submitted_at: new Date().toISOString(),
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to submit form');
        return { ...data[0], status: 'submitted' as SubmissionStatus };
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Observable<FormSubmission> {
    console.warn('Status updates are not persisted in the database');
    return from(
      this.supabase.client
        .from('form_submissions')
        .select('*')
        .eq('id', submissionId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return { ...data, status } as FormSubmission;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteSubmission(submissionId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    // FIX: Added church_id ownership verification before delete.
    // Previously had no check — any authenticated user could delete any
    // submission by guessing its UUID.
    return from(
      (async () => {
        // Verify the submission's form belongs to this church
        const { data: submission } = await this.supabase.client
          .from('form_submissions')
          .select(`id, form:form_templates!form_id(church_id)`)
          .eq('id', submissionId)
          .single();

        if (!submission) throw new Error('Submission not found');

        const submissionChurchId = (submission as any).form?.church_id;
        if (submissionChurchId !== churchId) {
          throw new Error('Access denied');
        }

        return this.supabase.delete('form_submissions', submissionId);
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== EXPORT ====================

  exportSubmissions(templateId: string): Observable<Blob> {
    return this.getFormSubmissions(templateId, 1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) throw new Error('No submissions to export');

        const allKeys = new Set<string>();
        data.forEach((submission) => {
          Object.keys(submission.submission_data).forEach((key) =>
            allKeys.add(key),
          );
        });

        const headers = [
          'Submitted At',
          'Member',
          'IP Address',
          ...Array.from(allKeys),
        ];

        const rows = data.map((submission: any) => {
          const memberName = submission.member
            ? `${submission.member.first_name} ${submission.member.last_name}`
            : 'Guest';

          const row = [
            new Date(submission.submitted_at).toLocaleString(),
            memberName,
            submission.ip_address || 'N/A',
          ];

          allKeys.forEach((key) => {
            const value = submission.submission_data[key];
            row.push(Array.isArray(value) ? value.join('; ') : value || '');
          });

          return row;
        });

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== STATISTICS ====================

  getFormStatistics(templateId: string): Observable<FormStatistics> {
    return this.getFormSubmissions(templateId, 1, 10000).pipe(
      map(({ data }) => ({
        total_submissions: data.length,
        pending_submissions: data.length,
        reviewed_submissions: 0,
        approved_submissions: 0,
        rejected_submissions: 0,
      })),
    );
  }
}
