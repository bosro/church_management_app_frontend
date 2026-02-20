// src/app/features/members/services/member.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  Member,
  MemberSearchFilters,
  MemberStatistics,
  ImportResult,
  MemberCreateInput,
  MemberUpdateInput,
  MemberListResult
} from '../../../models/member.model';

@Injectable({
  providedIn: 'root'
})
export class MemberService {
  private churchId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {
    this.churchId = this.authService.getChurchId();
  }

  // Get all members with filters and pagination
  getMembers(
    filters: MemberSearchFilters = {},
    page: number = 1,
    pageSize: number = 20
  ): Observable<MemberListResult> {
    return from(this.fetchMembers(filters, page, pageSize));
  }

  private async fetchMembers(
    filters: MemberSearchFilters,
    page: number,
    pageSize: number
  ): Promise<MemberListResult> {
    let query = this.supabase.client
      .from('members')
      .select('*', { count: 'exact' })
      .eq('church_id', this.churchId);

    // Apply filters
    if (filters.search_term) {
      query = query.or(`first_name.ilike.%${filters.search_term}%,last_name.ilike.%${filters.search_term}%,email.ilike.%${filters.search_term}%,phone_primary.ilike.%${filters.search_term}%`);
    }

    if (filters.gender_filter) {
      query = query.eq('gender', filters.gender_filter);
    }

    if (filters.status_filter) {
      query = query.eq('membership_status', filters.status_filter);
    }

    if (filters.branch_filter) {
      query = query.eq('branch_id', filters.branch_filter);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return {
      data: (data || []) as Member[],
      count: count || 0,
      page,
      pageSize,
      totalPages
    };
  }

  // Get single member by ID
  getMemberById(id: string): Observable<Member> {
    return from(
      this.supabase.client
        .from('members')
        .select('*')
        .eq('id', id)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Member not found');
        return data as Member;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // Create new member
  createMember(memberData: MemberCreateInput): Observable<Member> {
    const data = {
      ...memberData,
      church_id: this.churchId,
      membership_status: 'active' as const,
      is_new_convert: memberData.is_new_convert || false,
      is_visitor: memberData.is_visitor || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return from(
      this.supabase.client
        .from('members')
        .insert(data)
        .select()
        .single()
    ).pipe(
      map(({ data: member, error }) => {
        if (error) throw new Error(error.message);
        if (!member) throw new Error('Failed to create member');
        return member as Member;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // Update existing member
  updateMember(id: string, memberData: MemberUpdateInput): Observable<Member> {
    const data = {
      ...memberData,
      updated_at: new Date().toISOString()
    };

    return from(
      this.supabase.client
        .from('members')
        .update(data)
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data: member, error }) => {
        if (error) throw new Error(error.message);
        if (!member) throw new Error('Failed to update member');
        return member as Member;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // Delete (soft delete - set to inactive)
  deleteMember(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('members')
        .update({
          membership_status: 'inactive' as const,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // Upload member photo
  uploadMemberPhoto(memberId: string, file: File): Observable<string> {
    return from(this.uploadPhoto(memberId, file));
  }

  private async uploadPhoto(memberId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${memberId}_${Date.now()}.${fileExt}`;
    const filePath = `members/${this.churchId}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('member-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = this.supabase.client.storage
      .from('member-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  // Get member statistics
  getMemberStatistics(): Observable<MemberStatistics> {
    return from(
      this.supabase.callFunction<MemberStatistics>('get_membership_stats', {
        church_uuid: this.churchId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data || {
          total_members: 0,
          active_members: 0,
          inactive_members: 0,
          new_members_this_month: 0,
          new_members_this_year: 0,
          male_members: 0,
          female_members: 0
        };
      }),
      catchError(err => {
        console.error('Error fetching statistics:', err);
        return of({
          total_members: 0,
          active_members: 0,
          inactive_members: 0,
          new_members_this_month: 0,
          new_members_this_year: 0,
          male_members: 0,
          female_members: 0
        });
      })
    );
  }

  // Export members to CSV
  exportMembersToCSV(filters: MemberSearchFilters = {}): Observable<Blob> {
    return this.getMembers(filters, 1, 10000).pipe(
      map(({ data: members }) => {
        const headers = [
          'Member Number', 'First Name', 'Middle Name', 'Last Name',
          'Email', 'Phone', 'Gender', 'Date of Birth', 'Marital Status',
          'Address', 'City', 'Occupation', 'Join Date', 'Status'
        ];

        const rows = members.map(m => [
          m.member_number,
          m.first_name,
          m.middle_name || '',
          m.last_name,
          m.email || '',
          m.phone_primary || '',
          m.gender || '',
          m.date_of_birth || '',
          m.marital_status || '',
          m.address || '',
          m.city || '',
          m.occupation || '',
          m.join_date,
          m.membership_status
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      })
    );
  }

  // Import members from CSV
  importMembersFromCSV(file: File): Observable<ImportResult> {
    return from(this.processCSVImport(file));
  }

  private async processCSVImport(file: File): Promise<ImportResult> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const results: ImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());

      try {
        const memberData: MemberCreateInput = {
          first_name: values[0],
          last_name: values[1],
          email: values[2] || undefined,
          phone_primary: values[3] || undefined,
          gender: (values[4] as any) || undefined,
          date_of_birth: values[5] || undefined,
          address: values[6] || undefined,
          city: values[7] || undefined,
          join_date: values[8] || new Date().toISOString().split('T')[0],
          is_new_convert: false,
          is_visitor: false
        };

        // Validate required fields
        if (!memberData.first_name || !memberData.last_name) {
          throw new Error('First name and last name are required');
        }

        const insertData = {
          ...memberData,
          church_id: this.churchId,
          membership_status: 'active' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { error } = await this.supabase.client
          .from('members')
          .insert(insertData);

        if (error) throw error;

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: error.message,
          data: values
        });
      }
    }

    return results;
  }

  // Search members (autocomplete)
  searchMembers(query: string, limit: number = 10): Observable<Member[]> {
    return from(
      this.supabase.client
        .from('members')
        .select('id, first_name, last_name, member_number, photo_url')
        .eq('church_id', this.churchId)
        .eq('membership_status', 'active')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_number.ilike.%${query}%`)
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as Member[];
      })
    );
  }
}
