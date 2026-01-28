// src/app/features/ministries/services/ministry.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth';
import { SupabaseService } from '../../../core/services/supabase';
import {
  Ministry,
  MinistryLeader,
  MinistryMember,
} from '../../../models/ministry.model';

@Injectable({
  providedIn: 'root',
})
export class MinistryService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // MINISTRIES CRUD
  getMinistries(
    page: number = 1,
    pageSize: number = 20,
  ): Observable<{ data: Ministry[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('ministries')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Ministry[], count: count || 0 };
      })(),
    );
  }

  getMinistryById(ministryId: string): Observable<Ministry> {
    return from(
      this.supabase.query<Ministry>('ministries', {
        filters: { id: ministryId },
        limit: 1,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Ministry not found');
        return data[0];
      }),
    );
  }

  createMinistry(ministryData: Partial<Ministry>): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<Ministry>('ministries', {
        ...ministryData,
        church_id: churchId,
        is_active: true,
        member_count: 0,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  updateMinistry(
    ministryId: string,
    ministryData: Partial<Ministry>,
  ): Observable<Ministry> {
    return from(
      this.supabase.update<Ministry>('ministries', ministryId, ministryData),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  deleteMinistry(ministryId: string): Observable<void> {
    return from(
      this.supabase.update<Ministry>('ministries', ministryId, {
        is_active: false,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // MINISTRY MEMBERS
  getMinistryMembers(ministryId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('ministry_members')
        .select(
          `
          *,
          member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
        `,
        )
        .eq('ministry_id', ministryId)
        .order('joined_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
    );
  }

  addMemberToMinistry(
    ministryId: string,
    memberId: string,
    role?: string,
  ): Observable<MinistryMember> {
    return from(
      (async () => {
        // Check if member already exists
        const { data: existing } = await this.supabase.client
          .from('ministry_members')
          .select('*')
          .eq('ministry_id', ministryId)
          .eq('member_id', memberId)
          .single();

        if (existing) {
          throw new Error('Member already in this ministry');
        }

        // Add member
        const { data, error } = await this.supabase.insert<MinistryMember>(
          'ministry_members',
          {
            ministry_id: ministryId,
            member_id: memberId,
            role: role || null,
            joined_date: new Date().toISOString().split('T')[0],
            is_active: true,
          },
        );

        if (error) throw error;

        // Update member count
        await this.updateMemberCount(ministryId);

        return data![0];
      })(),
    );
  }

  removeMemberFromMinistry(
    membershipId: string,
    ministryId: string,
  ): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.delete(
          'ministry_members',
          membershipId,
        );
        if (error) throw error;

        // Update member count
        await this.updateMemberCount(ministryId);
      })(),
    );
  }

  updateMinistryMember(
    membershipId: string,
    data: Partial<MinistryMember>,
  ): Observable<MinistryMember> {
    return from(
      this.supabase.update<MinistryMember>(
        'ministry_members',
        membershipId,
        data,
      ),
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        return updatedData![0];
      }),
    );
  }

  // MINISTRY LEADERS
  getMinistryLeaders(ministryId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('ministry_leaders')
        .select(
          `
          *,
          member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
        `,
        )
        .eq('ministry_id', ministryId)
        .order('start_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
    );
  }

  addMinistryLeader(
    ministryId: string,
    memberId: string,
    position: string,
    startDate: string,
    endDate?: string,
  ): Observable<MinistryLeader> {
    return from(
      this.supabase.insert<MinistryLeader>('ministry_leaders', {
        ministry_id: ministryId,
        member_id: memberId,
        position: position,
        start_date: startDate,
        end_date: endDate || null,
        is_current: !endDate,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  removeMinistryLeader(leadershipId: string): Observable<void> {
    return from(this.supabase.delete('ministry_leaders', leadershipId)).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  updateMinistryLeader(
    leadershipId: string,
    data: Partial<MinistryLeader>,
  ): Observable<MinistryLeader> {
    return from(
      this.supabase.update<MinistryLeader>(
        'ministry_leaders',
        leadershipId,
        data,
      ),
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        return updatedData![0];
      }),
    );
  }

  // STATISTICS
  getMinistryStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Get total ministries
        const { count: totalMinistries } = await this.supabase.client
          .from('ministries')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('is_active', true);

        // Get ministry IDs
        const { data: ministriesData } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('church_id', churchId)
          .eq('is_active', true);

        const ministryIds = ministriesData?.map((m) => m.id) || [];

        // Get total ministry members
        const { count: totalMembers } = await this.supabase.client
          .from('ministry_members')
          .select('ministry_id', { count: 'exact', head: true })
          .eq('is_active', true)
          .in('ministry_id', ministryIds);

        return {
          total_ministries: totalMinistries || 0,
          total_members: totalMembers || 0,
          largest_ministry: ministryIds?.[0] || null,
        };
      })(),
    );
  }

  // HELPER METHODS
  private async updateMemberCount(ministryId: string): Promise<void> {
    const { count } = await this.supabase.client
      .from('ministry_members')
      .select('*', { count: 'exact', head: true })
      .eq('ministry_id', ministryId)
      .eq('is_active', true);

    await this.supabase.update('ministries', ministryId, {
      member_count: count || 0,
    });
  }

  // SEARCH MEMBERS (for adding to ministry)
  searchAvailableMembers(ministryId: string, query: string): Observable<any[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Get all members in this ministry
        const { data: ministryMembers } = await this.supabase.client
          .from('ministry_members')
          .select('member_id')
          .eq('ministry_id', ministryId);

        const memberIds = ministryMembers?.map((m) => m.member_id) || [];

        // Search members not in ministry
        let searchQuery = this.supabase.client
          .from('members')
          .select(
            'id, first_name, last_name, photo_url, member_number, phone_primary, email',
          )
          .eq('church_id', churchId);

        // Exclude members already in ministry
        if (memberIds.length > 0) {
          searchQuery = searchQuery.not('id', 'in', `(${memberIds.join(',')})`);
        }

        // Search by name, email, or phone
        searchQuery = searchQuery.or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone_primary.ilike.%${query}%`,
        );

        const { data, error } = await searchQuery.limit(10);

        if (error) throw error;
        return data || [];
      })(),
    );
  }

  // EXPORT
  exportMinistryReport(ministryId: string): Observable<Blob> {
    return this.getMinistryMembers(ministryId).pipe(
      map((members) => {
        const headers = [
          'Name',
          'Member Number',
          'Role',
          'Joined Date',
          'Phone',
          'Email',
        ];

        const rows = members.map((m: any) => [
          `${m.member.first_name} ${m.member.last_name}`,
          m.member.member_number,
          m.role || 'Member',
          m.joined_date,
          m.member.phone_primary || '',
          m.member.email || '',
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      }),
    );
  }
}
