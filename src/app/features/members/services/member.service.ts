// src/app/features/members/services/member.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { Member, MemberSearchFilters } from '../../../models/member.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { StorageService } from '../../../core/services/storage';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private storageService: StorageService,
  ) {}

  // Get all members with filters
  getMembers(
    filters?: MemberSearchFilters,
    page: number = 1,
    pageSize: number = 20,
  ): Observable<{ data: Member[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('members')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.search_term) {
          query = query.or(
            `first_name.ilike.%${filters.search_term}%,last_name.ilike.%${filters.search_term}%,email.ilike.%${filters.search_term}%,phone_primary.ilike.%${filters.search_term}%`,
          );
        }

        if (filters?.gender_filter) {
          query = query.eq('gender', filters.gender_filter);
        }

        if (filters?.status_filter) {
          query = query.eq('membership_status', filters.status_filter);
        }

        if (filters?.branch_filter) {
          query = query.eq('branch_id', filters.branch_filter);
        }

        if (filters?.ministry_filter) {
          const { data: ministryMembers, error } = await this.supabase.client
            .from('member_ministry_map')
            .select('member_id')
            .eq('ministry_id', filters.ministry_filter);

          if (error) throw error;

          const memberIds = ministryMembers?.map((m) => m.member_id) ?? [];

          // If no members belong to the ministry, return empty result early
          if (memberIds.length === 0) {
            return { data: [], count: 0 };
          }

          query = query.in('id', memberIds);
        }

        // Pagination
        query = query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return { data: data as Member[], count: count || 0 };
      })(),
    );
  }

  // Get single member by ID
  getMemberById(memberId: string): Observable<Member> {
    return from(
      this.supabase.query<Member>('members', {
        filters: { id: memberId },
        limit: 1,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Member not found');
        return data[0];
      }),
    );
  }

  // Create new member
  createMember(memberData: Partial<Member>): Observable<Member> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Generate member number
        const { data: memberNumberData } = await this.supabase.callFunction<{
          member_number: string;
        }>('generate_member_number', { church_uuid: churchId });

        const newMember: Partial<Member> = {
          ...memberData,
          church_id: churchId,
          member_number: memberNumberData?.member_number || `MEM${Date.now()}`,
          membership_status: 'active',
          is_new_convert: false,
          is_visitor: false,
        };

        const { data, error } = await this.supabase.insert<Member>(
          'members',
          newMember,
        );

        if (error) throw error;
        return data![0];
      })(),
    );
  }

  // Update member
  updateMember(
    memberId: string,
    memberData: Partial<Member>,
  ): Observable<Member> {
    return from(
      this.supabase.update<Member>('members', memberId, memberData),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  // Delete member (soft delete)
  deleteMember(memberId: string): Observable<void> {
    return from(
      this.supabase.update<Member>('members', memberId, {
        membership_status: 'inactive',
        updated_at: new Date().toISOString(),
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // Upload member photo
  uploadMemberPhoto(memberId: string, file: File): Observable<string> {
    const churchId = this.authService.getChurchId();
    return this.storageService.uploadMemberPhoto(churchId!, memberId, file);
  }

  // Import members from CSV
  importMembersFromCSV(
    file: File,
  ): Observable<{ success: number; errors: string[] }> {
    return from(
      (async () => {
        const text = await file.text();
        const rows = text.split('\n').slice(1); // Skip header

        let success = 0;
        const errors: string[] = [];

        for (const row of rows) {
          if (!row.trim()) continue;

          const columns = row.split(',').map((col) => col.trim());

          try {
            const memberData: Partial<Member> = {
              first_name: columns[0],
              last_name: columns[1],
              email: columns[2] || undefined,
              phone_primary: columns[3] || undefined,
              gender:
                (columns[4]?.toLowerCase() as 'male' | 'female') || undefined,
              date_of_birth: columns[5] || undefined,
              address: columns[6] || undefined,
              join_date: columns[7] || new Date().toISOString().split('T')[0],
            };

            await this.createMember(memberData).toPromise();
            success++;
          } catch (error: any) {
            errors.push(`Row ${success + errors.length + 2}: ${error.message}`);
          }
        }

        return { success, errors };
      })(),
    );
  }

  // Export members to CSV
  exportMembersToCSV(filters?: MemberSearchFilters): Observable<Blob> {
    return this.getMembers(filters, 1, 10000).pipe(
      map(({ data }) => {
        const headers = [
          'Member Number',
          'First Name',
          'Last Name',
          'Email',
          'Phone',
          'Gender',
          'Date of Birth',
          'Address',
          'Join Date',
          'Status',
        ];

        const rows = data.map((member) => [
          member.member_number,
          member.first_name,
          member.last_name,
          member.email || '',
          member.phone_primary || '',
          member.gender || '',
          member.date_of_birth || '',
          member.address || '',
          member.join_date,
          member.membership_status,
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      }),
    );
  }

  // Get member statistics
  getMemberStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.callFunction('get_membership_stats', {
        church_uuid: churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  // Search members (autocomplete)
  searchMembers(query: string): Observable<Member[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('members')
        .select('id, first_name, last_name, email, phone_primary, photo_url')
        .eq('church_id', churchId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(10),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Member[];
      }),
    );
  }
}
