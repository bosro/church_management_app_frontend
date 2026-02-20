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
  MINISTRY_CATEGORIES
} from '../../../models/ministry.model';

/**
 * MinistryService
 *
 * IMPORTANT: This service works with your existing RLS (Row Level Security) setup:
 *
 * Database Functions (already in your database):
 * - get_user_church_id(): Automatically returns the church_id for the logged-in user
 * - is_admin(): Automatically checks if the logged-in user has admin privileges
 *
 * RLS Policies (now applied to all ministry tables):
 * - Users can only view data from their own church (via get_user_church_id())
 * - Only admins can create/update/delete (via is_admin())
 *
 * How it works:
 * 1. When you make a query, Supabase automatically applies RLS policies
 * 2. The database filters results based on the user's church_id
 * 3. The database blocks unauthorized operations automatically
 * 4. You don't need to manually add church_id filters in most queries
 *
 * Client-side permission checks (canManageMinistries, etc.):
 * - These are ONLY for UX (showing/hiding buttons, etc.)
 * - The real security is enforced by RLS at the database level
 * - Even if someone bypasses the UI, the database will block them
 */

@Injectable({
  providedIn: 'root',
})
export class MinistryService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ==================== PERMISSIONS (Client-side UX only) ====================
  // These control what users see in the UI. Real security is in the database.

  canManageMinistries(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewMinistries(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'];
    return this.authService.hasRole(roles);
  }

  canManageMembers(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  // ==================== MINISTRIES CRUD ====================

  /**
   * Get ministries with pagination and filters
   *
   * Note: RLS automatically filters by church_id, so we don't need to add it manually.
   * The database will only return ministries from the user's church.
   */
  getMinistries(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      isActive?: boolean;
      category?: string;
      searchTerm?: string;
    }
  ): Observable<{ data: Ministry[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        // RLS will automatically filter by church_id using get_user_church_id()
        let query = this.supabase.client
          .from('ministries')
          .select(`
            *,
            leader:members!leader_id(id, first_name, last_name, photo_url, phone_primary, email)
          `, { count: 'exact' })
          .eq('church_id', churchId); // We still add this for clarity, but RLS enforces it

        // Apply optional filters
        if (filters?.isActive !== undefined) {
          query = query.eq('is_active', filters.isActive);
        }
        if (filters?.category) {
          query = query.eq('category', filters.category);
        }
        if (filters?.searchTerm) {
          query = query.or(`name.ilike.%${filters.searchTerm}%,description.ilike.%${filters.searchTerm}%`);
        }

        const { data, error, count } = await query
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Ministry[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading ministries:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get a single ministry by ID
   *
   * RLS will automatically verify the ministry belongs to the user's church.
   * If not, the query will return no results.
   */
  getMinistryById(ministryId: string): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('ministries')
        .select(`
          *,
          leader:members!leader_id(id, first_name, last_name, photo_url, phone_primary, email),
          branch:branches(id, name)
        `)
        .eq('id', ministryId)
        .eq('church_id', churchId) // We add this for clarity, RLS enforces it
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Ministry not found');
        return data as Ministry;
      }),
      catchError(err => {
        console.error('Error loading ministry:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Create a new ministry
   *
   * RLS will automatically verify the user is an admin via is_admin().
   * If not admin, the database will reject the insert operation.
   */
  createMinistry(ministryData: MinistryFormData): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    // Validate required fields
    if (!ministryData.name || ministryData.name.trim().length < 2) {
      return throwError(() => new Error('Ministry name must be at least 2 characters'));
    }

    // Validate category if provided
    if (ministryData.category && !MINISTRY_CATEGORIES.includes(ministryData.category as any)) {
      return throwError(() => new Error('Invalid ministry category'));
    }

    // Validate meeting time format if provided
    if (ministryData.meeting_time && !this.isValidTimeFormat(ministryData.meeting_time)) {
      return throwError(() => new Error('Invalid time format. Use HH:MM'));
    }

    return from(
      (async () => {
        // Check for duplicate ministry name
        const { data: existing } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('church_id', churchId)
          .ilike('name', ministryData.name.trim())
          .maybeSingle();

        if (existing) {
          throw new Error('A ministry with this name already exists');
        }

        // RLS will verify user is admin before allowing insert
        return this.supabase.insert<Ministry>('ministries', {
          church_id: churchId,
          name: ministryData.name.trim(),
          description: ministryData.description?.trim() || null,
          category: ministryData.category || null,
          meeting_day: ministryData.meeting_day || null,
          meeting_time: ministryData.meeting_time || null,
          meeting_location: ministryData.meeting_location?.trim() || null,
          meeting_schedule: ministryData.meeting_schedule?.trim() || null,
          requirements: ministryData.requirements?.trim() || null,
          is_active: ministryData.is_active !== undefined ? ministryData.is_active : true,
          member_count: 0
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to create ministry');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating ministry:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Update an existing ministry
   *
   * RLS will automatically verify:
   * 1. The ministry belongs to the user's church
   * 2. The user is an admin
   */
  updateMinistry(
    ministryId: string,
    ministryData: Partial<MinistryFormData>
  ): Observable<Ministry> {
    const churchId = this.authService.getChurchId();

    // Validate name if provided
    if (ministryData.name !== undefined && ministryData.name.trim().length < 2) {
      return throwError(() => new Error('Ministry name must be at least 2 characters'));
    }

    // Validate category if provided
    if (ministryData.category && !MINISTRY_CATEGORIES.includes(ministryData.category as any)) {
      return throwError(() => new Error('Invalid ministry category'));
    }

    // Validate meeting time format if provided
    if (ministryData.meeting_time && !this.isValidTimeFormat(ministryData.meeting_time)) {
      return throwError(() => new Error('Invalid time format. Use HH:MM'));
    }

    return from(
      (async () => {
        // Verify ownership (RLS will also enforce this)
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
          meeting_location: ministryData.meeting_location?.trim() || null,
          meeting_schedule: ministryData.meeting_schedule?.trim() || null,
          requirements: ministryData.requirements?.trim() || null,
          updated_at: new Date().toISOString()
        };

        // RLS will verify user is admin and ministry belongs to their church
        return this.supabase.update<Ministry>('ministries', ministryId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update ministry');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating ministry:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Delete (soft delete) a ministry
   *
   * RLS will automatically verify the user is admin and the ministry belongs to their church.
   */
  deleteMinistry(ministryId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership and check member count
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
          throw new Error('Cannot delete ministry with active members. Please remove all members first.');
        }

        // Soft delete by setting is_active to false
        // RLS will verify user is admin
        return this.supabase.update<Ministry>('ministries', ministryId, {
          is_active: false,
          updated_at: new Date().toISOString()
        } as any);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(err => {
        console.error('Error deleting ministry:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== MINISTRY MEMBERS ====================

  /**
   * Get all members of a ministry
   *
   * RLS automatically ensures the ministry belongs to the user's church.
   */
  getMinistryMembers(ministryId: string): Observable<MinistryMember[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // First verify the ministry belongs to this church (RLS also enforces this)
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        // RLS will automatically filter ministry_members by church
        const { data, error } = await this.supabase.client
          .from('ministry_members')
          .select(`
            *,
            member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
          `)
          .eq('ministry_id', ministryId)
          .eq('is_active', true)
          .order('joined_date', { ascending: false });

        if (error) throw error;
        return data as MinistryMember[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading ministry members:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Add a member to a ministry
   *
   * RLS will verify the user is admin before allowing the insert.
   */
  addMemberToMinistry(
    ministryId: string,
    memberId: string,
    role?: string
  ): Observable<MinistryMember> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ministry belongs to this church
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

        // Verify member belongs to this church
        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        // Check if member already exists in this ministry
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
            // Reactivate existing membership
            const { data: reactivated, error: reactivateError } = await this.supabase.client
              .from('ministry_members')
              .update({
                is_active: true,
                role: role || null,
                joined_date: new Date().toISOString().split('T')[0]
              })
              .eq('id', existing.id)
              .select()
              .single();

            if (reactivateError) throw reactivateError;

            await this.updateMemberCount(ministryId);
            return reactivated as MinistryMember;
          }
        }

        // Add new member - RLS will verify user is admin
        const { data: newMember, error } = await this.supabase.client
          .from('ministry_members')
          .insert({
            ministry_id: ministryId,
            member_id: memberId,
            role: role || null,
            joined_date: new Date().toISOString().split('T')[0],
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // Update member count
        await this.updateMemberCount(ministryId);

        return newMember as MinistryMember;
      })()
    ).pipe(
      catchError(err => {
        console.error('Error adding member to ministry:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Remove a member from a ministry
   *
   * RLS will verify the user is admin before allowing the delete.
   */
  removeMemberFromMinistry(
    membershipId: string,
    ministryId: string
  ): Observable<void> {
    return from(
      (async () => {
        // RLS will verify user is admin and ministry belongs to their church
        const { error } = await this.supabase.client
          .from('ministry_members')
          .delete()
          .eq('id', membershipId);

        if (error) throw error;

        // Update member count
        await this.updateMemberCount(ministryId);
      })()
    ).pipe(
      catchError(err => {
        console.error('Error removing member from ministry:', err);
        return throwError(() => err);
      })
    );
  }

  updateMinistryMember(
    membershipId: string,
    data: Partial<MinistryMember>
  ): Observable<MinistryMember> {
    return from(
      this.supabase.update<MinistryMember>('ministry_members', membershipId, {
        ...data,
        updated_at: new Date().toISOString()
      } as any)
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Failed to update ministry member');
        }
        return updatedData[0];
      }),
      catchError(err => {
        console.error('Error updating ministry member:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== MINISTRY LEADERS ====================

  /**
   * Get all leaders of a ministry
   *
   * RLS automatically ensures the ministry belongs to the user's church.
   */
  getMinistryLeaders(ministryId: string): Observable<MinistryLeader[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ministry belongs to this church
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        // RLS will automatically filter by church
        const { data, error } = await this.supabase.client
          .from('ministry_leaders')
          .select(`
            *,
            member:members(id, first_name, last_name, photo_url, member_number, phone_primary, email)
          `)
          .eq('ministry_id', ministryId)
          .order('start_date', { ascending: false });

        if (error) throw error;
        return data as MinistryLeader[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading ministry leaders:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Add a leader to a ministry
   *
   * RLS will verify the user is admin before allowing the insert.
   */
  addMinistryLeader(
    ministryId: string,
    memberId: string,
    position: string,
    startDate: string,
    endDate?: string
  ): Observable<MinistryLeader> {
    const churchId = this.authService.getChurchId();

    // Validate required fields
    if (!position || position.trim().length < 2) {
      return throwError(() => new Error('Position must be at least 2 characters'));
    }

    if (!startDate) {
      return throwError(() => new Error('Start date is required'));
    }

    // Validate date format
    if (!this.isValidDateFormat(startDate)) {
      return throwError(() => new Error('Invalid start date format. Use YYYY-MM-DD'));
    }

    if (endDate && !this.isValidDateFormat(endDate)) {
      return throwError(() => new Error('Invalid end date format. Use YYYY-MM-DD'));
    }

    // Validate date logic
    if (endDate && new Date(endDate) < new Date(startDate)) {
      return throwError(() => new Error('End date cannot be before start date'));
    }

    return from(
      (async () => {
        // Verify ministry belongs to this church
        const { data: ministry } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('id', ministryId)
          .eq('church_id', churchId)
          .single();

        if (!ministry) {
          throw new Error('Ministry not found or access denied');
        }

        // Verify member belongs to this church
        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        // Check for overlapping leadership
        const { data: overlapping } = await this.supabase.client
          .from('ministry_leaders')
          .select('id')
          .eq('ministry_id', ministryId)
          .eq('member_id', memberId)
          .eq('is_current', true)
          .maybeSingle();

        if (overlapping) {
          throw new Error('This member is already a current leader of this ministry');
        }

        // RLS will verify user is admin
        return this.supabase.insert<MinistryLeader>('ministry_leaders', {
          ministry_id: ministryId,
          member_id: memberId,
          position: position.trim(),
          start_date: startDate,
          end_date: endDate || null,
          is_current: !endDate
        } as any);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to add ministry leader');
        return data[0];
      }),
      catchError(err => {
        console.error('Error adding ministry leader:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Remove a leader from a ministry
   *
   * RLS will verify the user is admin before allowing the delete.
   */
  removeMinistryLeader(leadershipId: string): Observable<void> {
    return from(
      this.supabase.delete('ministry_leaders', leadershipId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(err => {
        console.error('Error removing ministry leader:', err);
        return throwError(() => err);
      })
    );
  }

  updateMinistryLeader(
    leadershipId: string,
    data: Partial<MinistryLeader>
  ): Observable<MinistryLeader> {
    // Validate dates if provided
    if (data.start_date && !this.isValidDateFormat(data.start_date)) {
      return throwError(() => new Error('Invalid start date format'));
    }

    if (data.end_date && !this.isValidDateFormat(data.end_date)) {
      return throwError(() => new Error('Invalid end date format'));
    }

    if (data.start_date && data.end_date && new Date(data.end_date) < new Date(data.start_date)) {
      return throwError(() => new Error('End date cannot be before start date'));
    }

    return from(
      this.supabase.update<MinistryLeader>('ministry_leaders', leadershipId, {
        ...data,
        is_current: data.end_date ? false : data.is_current,
        updated_at: new Date().toISOString()
      } as any)
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Failed to update ministry leader');
        }
        return updatedData[0];
      }),
      catchError(err => {
        console.error('Error updating ministry leader:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== STATISTICS ====================

  /**
   * Get ministry statistics for the current user's church
   *
   * RLS automatically filters all queries by the user's church.
   */
  getMinistryStatistics(): Observable<MinistryStatistics> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // All these queries are automatically filtered by RLS

        // Get total ministries
        const { count: totalMinistries } = await this.supabase.client
          .from('ministries')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        // Get active ministries
        const { count: activeMinistries } = await this.supabase.client
          .from('ministries')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('is_active', true);

        // Get largest ministry
        const { data: ministriesData } = await this.supabase.client
          .from('ministries')
          .select('id, name, member_count')
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('member_count', { ascending: false })
          .limit(1);

        const largestMinistry = ministriesData && ministriesData.length > 0
          ? {
              id: ministriesData[0].id,
              name: ministriesData[0].name,
              member_count: ministriesData[0].member_count || 0
            }
          : undefined;

        // Get ministry IDs
        const { data: allMinistries } = await this.supabase.client
          .from('ministries')
          .select('id')
          .eq('church_id', churchId)
          .eq('is_active', true);

        const ministryIds = allMinistries?.map((m) => m.id) || [];

        // Get total members across all ministries
        let totalMembers = 0;
        if (ministryIds.length > 0) {
          const { count } = await this.supabase.client
            .from('ministry_members')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .in('ministry_id', ministryIds);

          totalMembers = count || 0;
        }

        // Count recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { count: recentActivity } = await this.supabase.client
          .from('ministry_members')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString())
          .in('ministry_id', ministryIds);

        return {
          total_ministries: totalMinistries || 0,
          active_ministries: activeMinistries || 0,
          inactive_ministries: (totalMinistries || 0) - (activeMinistries || 0),
          total_members: totalMembers,
          largest_ministry: largestMinistry,
          most_active_leaders: [],
          recent_activity_count: recentActivity || 0
        };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      })
    );
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
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Search for members not yet in a ministry
   *
   * RLS automatically filters members by the user's church.
   */
  searchAvailableMembers(ministryId: string, query: string): Observable<any[]> {
    const churchId = this.authService.getChurchId();

    if (!query || query.trim().length < 2) {
      return throwError(() => new Error('Search query must be at least 2 characters'));
    }

    return from(
      (async () => {
        // Get all members in this ministry
        const { data: ministryMembers } = await this.supabase.client
          .from('ministry_members')
          .select('member_id')
          .eq('ministry_id', ministryId)
          .eq('is_active', true);

        const memberIds = ministryMembers?.map((m) => m.member_id) || [];

        // Search members not in ministry - RLS filters by church
        let searchQuery = this.supabase.client
          .from('members')
          .select('id, first_name, last_name, photo_url, member_number, phone_primary, email')
          .eq('church_id', churchId);

        // Exclude members already in ministry
        if (memberIds.length > 0) {
          searchQuery = searchQuery.not('id', 'in', `(${memberIds.join(',')})`);
        }

        // Search by name, email, or phone
        const searchTerm = query.trim();
        searchQuery = searchQuery.or(
          `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone_primary.ilike.%${searchTerm}%,member_number.ilike.%${searchTerm}%`
        );

        const { data, error } = await searchQuery.limit(10);

        if (error) throw error;
        return data || [];
      })()
    ).pipe(
      catchError(err => {
        console.error('Search error:', err);
        return throwError(() => err);
      })
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
          m.member.member_number || '',
          m.role || 'Member',
          m.joined_date,
          m.member.phone_primary || '',
          m.member.email || '',
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.map(cell => `"${cell}"`).join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError(err => {
        console.error('Export error:', err);
        return throwError(() => err);
      })
    );
  }

  // Validation helpers
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

  // Search ministries
  searchMinistries(searchTerm: string, category?: string): Observable<Ministry[]> {
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
      })()
    ).pipe(
      catchError(err => {
        console.error('Search error:', err);
        return throwError(() => err);
      })
    );
  }

  // Get member ministries
  getMemberMinistries(memberId: string): Observable<Ministry[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('ministry_members')
          .select(`
            ministry:ministries(*)
          `)
          .eq('member_id', memberId)
          .eq('is_active', true);

        if (error) throw error;
        return data?.map((m: any) => m.ministry).filter(Boolean) as Ministry[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading member ministries:', err);
        return throwError(() => err);
      })
    );
  }
}
