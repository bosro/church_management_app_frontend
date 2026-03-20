// src/app/features/ministries/services/ministry.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of, timer } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth';
import { SupabaseService } from '../../../core/services/supabase';
import {
  Ministry,
  MinistryLeader,
  MinistryMember,
  MinistryFormData,
  MinistryStatistics,
  // REMOVED: MINISTRY_CATEGORIES (no longer needed for validation)
} from '../../../models/ministry.model';
import { SubscriptionService } from '../../../core/services/subscription.service';

@Injectable({
  providedIn: 'root',
})
export class MinistryService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
  ) {}

  // ==================== PERMISSIONS (Client-side UX only) ====================

  canManageMinistries(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewMinistries(): boolean {
    const roles = [
      'super_admin',
      'church_admin',
      'pastor',
      'ministry_leader',
      'secretary',
    ];
    return this.authService.hasRole(roles);
  }

  canManageMembers(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  // ==================== MINISTRIES CRUD ====================

  getMinistries(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      isActive?: boolean;
      category?: string;
      searchTerm?: string;
    },
  ): Observable<{ data: Ministry[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('ministries')
          .select(
            `*,
          leader:members!leader_id(id, first_name, last_name, photo_url, phone_primary, email)`,
            { count: 'exact' },
          )
          .eq('church_id', churchId);

        // Branch pastor only sees their branch ministries
        if (isBranchPastor && branchId) {
          query = query.eq('branch_id', branchId);
        }

        if (filters?.isActive !== undefined)
          query = query.eq('is_active', filters.isActive);
        if (filters?.category) query = query.eq('category', filters.category);
        if (filters?.searchTerm) {
          query = query.or(
            `name.ilike.%${filters.searchTerm}%,description.ilike.%${filters.searchTerm}%`,
          );
        }

        const { data, error, count } = await query
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        return { data: data as Ministry[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getMinistryById(ministryId: string): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('ministries')
        .select(
          `
          *,
          leader:members!leader_id(id, first_name, last_name, photo_url, phone_primary, email),
          branch:branches(id, name)
        `,
        )
        .eq('id', ministryId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Ministry not found');
        return data as Ministry;
      }),
      catchError((err) => {
        console.error('Error loading ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Create a new ministry
   * UPDATED: Removed category validation - now accepts any string
   */
  createMinistry(ministryData: MinistryFormData): Observable<Ministry> {
    const churchId = this.authService.getChurchId();
    const branchId = this.authService.getBranchId();

    if (!ministryData.name || ministryData.name.trim().length < 2) {
      return throwError(
        () => new Error('Ministry name must be at least 2 characters'),
      );
    }
    if (ministryData.category && ministryData.category.trim().length < 2) {
      return throwError(
        () => new Error('Category must be at least 2 characters'),
      );
    }
    if (
      ministryData.description &&
      ministryData.description.trim().length > 500
    ) {
      return throwError(
        () => new Error('Description cannot exceed 500 characters'),
      );
    }
    if (
      ministryData.meeting_time &&
      !this.isValidTimeFormat(ministryData.meeting_time)
    ) {
      return throwError(() => new Error('Invalid time format. Use HH:MM'));
    }

    return this.subscriptionService.checkQuota('ministries').pipe(
      switchMap((quota) => {
        if (!quota.allowed) {
          throw new Error(
            `QUOTA_EXCEEDED:ministries:${quota.current}:${quota.limit}`,
          );
        }
        return from(
          (async () => {
            const { data: existing } = await this.supabase.client
              .from('ministries')
              .select('id')
              .eq('church_id', churchId)
              .ilike('name', ministryData.name.trim())
              .maybeSingle();

            if (existing)
              throw new Error('A ministry with this name already exists');

            const insertData = {
              church_id: churchId,
              branch_id: branchId || null,
              name: ministryData.name.trim(),
              description: ministryData.description?.trim() || null,
              category: ministryData.category?.trim().toLowerCase() || null,
              meeting_day: ministryData.meeting_day || null,
              meeting_time: ministryData.meeting_time || null,
              meeting_location: ministryData.meeting_location?.trim() || null,
              meeting_schedule: ministryData.meeting_schedule?.trim() || null,
              requirements: ministryData.requirements?.trim() || null,
              is_active:
                ministryData.is_active !== undefined
                  ? ministryData.is_active
                  : true,
              member_count: 0,
            };

            return this.supabase.insert<Ministry>(
              'ministries',
              insertData as any,
            );
          })(),
        );
      }),
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0)
          throw new Error('Failed to create ministry');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error creating ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Update an existing ministry
   * UPDATED: Removed category validation - now accepts any string
   */
  updateMinistry(
    ministryId: string,
    ministryData: Partial<MinistryFormData>,
  ): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    // Validate name if provided
    if (
      ministryData.name !== undefined &&
      ministryData.name.trim().length < 2
    ) {
      return throwError(
        () => new Error('Ministry name must be at least 2 characters'),
      );
    }

    // REMOVED: Category validation against MINISTRY_CATEGORIES
    // Now we just check if category is provided and not empty
    if (ministryData.category && ministryData.category.trim().length < 2) {
      return throwError(
        () => new Error('Category must be at least 2 characters'),
      );
    }

    // Validate description length (500 characters max)
    if (
      ministryData.description &&
      ministryData.description.trim().length > 500
    ) {
      return throwError(
        () => new Error('Description cannot exceed 500 characters'),
      );
    }

    // Validate meeting time format if provided
    if (
      ministryData.meeting_time &&
      !this.isValidTimeFormat(ministryData.meeting_time)
    ) {
      return throwError(() => new Error('Invalid time format. Use HH:MM'));
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('ministries')
          .select('id, name')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Ministry not found or access denied');
        }

        // Check for duplicate name if name is being changed
        if (ministryData.name && ministryData.name.trim() !== existing.name) {
          const { data: duplicate } = await this.supabase.client
            .from('ministries')
            .select('id')
            .eq('church_id', churchId)
            .ilike('name', ministryData.name.trim())
            .neq('id', ministryId)
            .maybeSingle();

          if (duplicate) {
            throw new Error('A ministry with this name already exists');
          }
        }

        const updateData: any = {
          ...ministryData,
          name: ministryData.name?.trim(),
          description: ministryData.description?.trim() || null,
          category: ministryData.category?.trim().toLowerCase() || null, // Convert to lowercase
          meeting_location: ministryData.meeting_location?.trim() || null,
          meeting_schedule: ministryData.meeting_schedule?.trim() || null,
          requirements: ministryData.requirements?.trim() || null,
          updated_at: new Date().toISOString(),
        };

        return this.supabase.update<Ministry>(
          'ministries',
          ministryId,
          updateData,
        );
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0)
          throw new Error('Failed to update ministry');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error updating ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  deleteMinistry(ministryId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('ministries')
          .select('id, name, member_count')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Ministry not found or access denied');
        }

        if (existing.member_count && existing.member_count > 0) {
          throw new Error(
            'Cannot delete ministry with active members. Please remove all members first.',
          );
        }

        return this.supabase.update<Ministry>('ministries', ministryId, {
          is_active: false,
          updated_at: new Date().toISOString(),
        } as any);
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('Error deleting ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== MINISTRY MEMBERS ====================
  // (Rest of the methods remain the same - I'm keeping them unchanged)

  getMinistryMembers(ministryId: string): Observable<MinistryMember[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        const { data, error } = await this.supabase.client
          .from('ministry_members')
          .select(
            `
            *,
            member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
          `,
          )
          .eq('ministry_id', ministryId)
          .eq('is_active', true)
          .order('joined_date', { ascending: false });

        if (error) throw error;
        return data as MinistryMember[];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading ministry members:', err);
        return throwError(() => err);
      }),
    );
  }

  addMemberToMinistry(
    ministryId: string,
    memberId: string,
    role?: string,
  ): Observable<MinistryMember> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id, is_active')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        if (!ministry.is_active) {
          throw new Error('Cannot add members to inactive ministry');
        }

        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        const { data: existing } = await this.supabase.client
          .from('ministry_members')
          .select('id, is_active')
          .eq('ministry_id', ministryId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          if (existing.is_active) {
            throw new Error('Member is already in this ministry');
          } else {
            const { data: reactivated, error: reactivateError } =
              await this.supabase.client
                .from('ministry_members')
                .update({
                  is_active: true,
                  role: role || null,
                  joined_date: new Date().toISOString().split('T')[0],
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (reactivateError) throw reactivateError;

            await this.updateMemberCount(ministryId);
            return reactivated as MinistryMember;
          }
        }

        const { data: newMember, error } = await this.supabase.client
          .from('ministry_members')
          .insert({
            ministry_id: ministryId,
            member_id: memberId,
            role: role || null,
            joined_date: new Date().toISOString().split('T')[0],
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;

        await this.updateMemberCount(ministryId);

        return newMember as MinistryMember;
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error adding member to ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  removeMemberFromMinistry(
    membershipId: string,
    ministryId: string,
  ): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client
          .from('ministry_members')
          .delete()
          .eq('id', membershipId);

        if (error) throw error;

        await this.updateMemberCount(ministryId);
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error removing member from ministry:', err);
        return throwError(() => err);
      }),
    );
  }

  updateMinistryMember(
    membershipId: string,
    data: Partial<MinistryMember>,
  ): Observable<MinistryMember> {
    return from(
      this.supabase.update<MinistryMember>('ministry_members', membershipId, {
        ...data,
        updated_at: new Date().toISOString(),
      } as any),
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Failed to update ministry member');
        }
        return updatedData[0];
      }),
      catchError((err) => {
        console.error('Error updating ministry member:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== MINISTRY LEADERS ====================

  getMinistryLeaders(ministryId: string): Observable<MinistryLeader[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        const { data, error } = await this.supabase.client
          .from('ministry_leaders')
          .select(
            `
            *,
            member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
          `,
          )
          .eq('ministry_id', ministryId)
          .order('start_date', { ascending: false });

        if (error) throw error;
        return data as MinistryLeader[];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading ministry leaders:', err);
        return throwError(() => err);
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
    const churchId = this.authService.getChurchId();

    if (!position || position.trim().length < 2) {
      return throwError(
        () => new Error('Position must be at least 2 characters'),
      );
    }

    if (!startDate) {
      return throwError(() => new Error('Start date is required'));
    }

    if (!this.isValidDateFormat(startDate)) {
      return throwError(
        () => new Error('Invalid start date format. Use YYYY-MM-DD'),
      );
    }

    if (endDate && !this.isValidDateFormat(endDate)) {
      return throwError(
        () => new Error('Invalid end date format. Use YYYY-MM-DD'),
      );
    }

    if (endDate && new Date(endDate) < new Date(startDate)) {
      return throwError(
        () => new Error('End date cannot be before start date'),
      );
    }

    return from(
      (async () => {
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        const { data: overlapping } = await this.supabase.client
          .from('ministry_leaders')
          .select('id')
          .eq('ministry_id', ministryId)
          .eq('member_id', memberId)
          .eq('is_current', true)
          .maybeSingle();

        if (overlapping) {
          throw new Error(
            'This member is already a current leader of this ministry',
          );
        }

        return this.supabase.insert<MinistryLeader>('ministry_leaders', {
          ministry_id: ministryId,
          member_id: memberId,
          position: position.trim(),
          start_date: startDate,
          end_date: endDate || null,
          is_current: !endDate,
        } as any);
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0)
          throw new Error('Failed to add ministry leader');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error adding ministry leader:', err);
        return throwError(() => err);
      }),
    );
  }

  removeMinistryLeader(leadershipId: string): Observable<void> {
    return from(this.supabase.delete('ministry_leaders', leadershipId)).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('Error removing ministry leader:', err);
        return throwError(() => err);
      }),
    );
  }

  updateMinistryLeader(
    leadershipId: string,
    data: Partial<MinistryLeader>,
  ): Observable<MinistryLeader> {
    if (data.start_date && !this.isValidDateFormat(data.start_date)) {
      return throwError(() => new Error('Invalid start date format'));
    }

    if (data.end_date && !this.isValidDateFormat(data.end_date)) {
      return throwError(() => new Error('Invalid end date format'));
    }

    if (
      data.start_date &&
      data.end_date &&
      new Date(data.end_date) < new Date(data.start_date)
    ) {
      return throwError(
        () => new Error('End date cannot be before start date'),
      );
    }

    return from(
      this.supabase.update<MinistryLeader>('ministry_leaders', leadershipId, {
        ...data,
        is_current: data.end_date ? false : data.is_current,
        updated_at: new Date().toISOString(),
      } as any),
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Failed to update ministry leader');
        }
        return updatedData[0];
      }),
      catchError((err) => {
        console.error('Error updating ministry leader:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== STATISTICS ====================

  getMinistryStatistics(): Observable<MinistryStatistics> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    return from(
      (async () => {
        let baseQuery = this.supabase.client
          .from('ministries')
          .select('id, name, member_count, is_active')
          .eq('church_id', churchId);

        // Branch pastor only sees their branch
        if (isBranchPastor && branchId) {
          baseQuery = baseQuery.eq('branch_id', branchId);
        }

        const { data: allMinistries } = await baseQuery;
        const ministries = allMinistries || [];

        const totalMinistries = ministries.length;
        const activeMinistries = ministries.filter((m) => m.is_active).length;
        const ministryIds = ministries.map((m) => m.id);

        const largest = ministries
          .filter((m) => m.is_active)
          .sort((a, b) => (b.member_count || 0) - (a.member_count || 0))[0];

        let totalMembers = 0;
        let recentActivity = 0;

        if (ministryIds.length > 0) {
          const { count: memberCount } = await this.supabase.client
            .from('ministry_members')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .in('ministry_id', ministryIds);

          totalMembers = memberCount || 0;

          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { count: recentCount } = await this.supabase.client
            .from('ministry_members')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', thirtyDaysAgo.toISOString())
            .in('ministry_id', ministryIds);

          recentActivity = recentCount || 0;
        }

        return {
          total_ministries: totalMinistries,
          active_ministries: activeMinistries,
          inactive_ministries: totalMinistries - activeMinistries,
          total_members: totalMembers,
          largest_ministry: largest
            ? {
                id: largest.id,
                name: largest.name,
                member_count: largest.member_count || 0,
              }
            : undefined,
          most_active_leaders: [],
          recent_activity_count: recentActivity,
        };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== HELPER METHODS ====================

  private async updateMemberCount(ministryId: string): Promise<void> {
    const { count } = await this.supabase.client
      .from('ministry_members')
      .select('*', { count: 'exact', head: true })
      .eq('ministry_id', ministryId)
      .eq('is_active', true);

    await this.supabase.update('ministries', ministryId, {
      member_count: count || 0,
      updated_at: new Date().toISOString(),
    });
  }

  searchAvailableMembers(ministryId: string, query: string): Observable<any[]> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    if (!query || query.trim().length < 2) {
      return throwError(
        () => new Error('Search query must be at least 2 characters'),
      );
    }

    return from(
      (async () => {
        const { data: ministryMembers } = await this.supabase.client
          .from('ministry_members')
          .select('member_id')
          .eq('ministry_id', ministryId)
          .eq('is_active', true);

        const memberIds = ministryMembers?.map((m) => m.member_id) || [];

        let searchQuery = this.supabase.client
          .from('members')
          .select(
            'id, first_name, last_name, photo_url, member_number, phone_primary, email',
          )
          .eq('church_id', churchId);

        // Branch pastor only searches their branch members
        if (isBranchPastor && branchId) {
          searchQuery = searchQuery.eq('branch_id', branchId);
        }

        if (memberIds.length > 0) {
          searchQuery = searchQuery.not('id', 'in', `(${memberIds.join(',')})`);
        }

        searchQuery = searchQuery.or(
          `first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%,phone_primary.ilike.%${query.trim()}%,member_number.ilike.%${query.trim()}%`,
        );

        const { data, error } = await searchQuery.limit(10);
        if (error) throw error;
        return data || [];
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

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
          m.member.member_number || '',
          m.role || 'Member',
          m.joined_date,
          m.member.phone_primary || '',
          m.member.email || '',
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => {
        console.error('Export error:', err);
        return throwError(() => err);
      }),
    );
  }

  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  private isValidDateFormat(date: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;

    const parsedDate = new Date(date);
    return parsedDate instanceof Date && !isNaN(parsedDate.getTime());
  }

  searchMinistries(
    searchTerm: string,
    category?: string,
  ): Observable<Ministry[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('ministries')
          .select('*')
          .eq('church_id', churchId)
          .eq('is_active', true)
          .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);

        if (category) {
          query = query.eq('category', category);
        }

        const { data, error } = await query
          .order('name', { ascending: true })
          .limit(20);

        if (error) throw error;
        return data as Ministry[];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Search error:', err);
        return throwError(() => err);
      }),
    );
  }

  getMemberMinistries(memberId: string): Observable<Ministry[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('ministry_members')
          .select(
            `
            ministry:ministries(*)
          `,
          )
          .eq('member_id', memberId)
          .eq('is_active', true);

        if (error) throw error;
        return data?.map((m: any) => m.ministry).filter(Boolean) as Ministry[];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading member ministries:', err);
        return throwError(() => err);
      }),
    );
  }
}
