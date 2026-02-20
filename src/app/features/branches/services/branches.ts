// src/app/features/branches/services/branches.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  Branch,
  BranchMember,
  BranchStatistics,
  BranchFormData,
} from '../../../models/branch.model';

@Injectable({
  providedIn: 'root',
})
export class BranchesService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ==================== PERMISSIONS ====================

  canManageBranches(): boolean {
    const roles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(roles);
  }

  canViewBranches(): boolean {
    const roles = [
      'super_admin',
      'church_admin',
      'pastor',
      'ministry_leader',
      'secretary',
    ];
    return this.authService.hasRole(roles);
  }

  canAssignMembers(): boolean {
    const roles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(roles);
  }

  // ==================== BRANCHES CRUD ====================

  getBranches(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      isActive?: boolean;
      city?: string;
      state?: string;
    },
  ): Observable<{ data: Branch[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('branches')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.isActive !== undefined) {
          query = query.eq('is_active', filters.isActive);
        }
        if (filters?.city) {
          query = query.ilike('city', `%${filters.city}%`);
        }
        if (filters?.state) {
          query = query.ilike('state', `%${filters.state}%`);
        }

        const { data, error, count } = await query
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as Branch[], count: count || 0 };
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading branches:', err);
        return throwError(() => err);
      }),
    );
  }

  getBranchById(branchId: string): Observable<Branch> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('branches')
        .select('*')
        .eq('id', branchId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Branch not found');
        return data as Branch;
      }),
      catchError((err) => {
        console.error('Error loading branch:', err);
        return throwError(() => err);
      }),
    );
  }

  createBranch(branchData: BranchFormData): Observable<Branch> {
    const churchId = this.authService.getChurchId();

    // Validate required fields
    if (!branchData.name || branchData.name.trim().length < 3) {
      return throwError(
        () => new Error('Branch name must be at least 3 characters'),
      );
    }

    // Validate email if provided
    if (branchData.email && !this.isValidEmail(branchData.email)) {
      return throwError(() => new Error('Invalid email address'));
    }

    // Validate established date if provided
    if (branchData.established_date) {
      const date = new Date(branchData.established_date);
      if (isNaN(date.getTime())) {
        return throwError(() => new Error('Invalid established date'));
      }
      if (date > new Date()) {
        return throwError(
          () => new Error('Established date cannot be in the future'),
        );
      }
    }

    return from(
      this.supabase.insert<Branch>('branches', {
        church_id: churchId,
        name: branchData.name.trim(),
        pastor_name: branchData.pastor_name?.trim() || null,
        address: branchData.address?.trim() || undefined,
        city: branchData.city?.trim() || null,
        state: branchData.state?.trim() || null,
        country: branchData.country?.trim() || null,
        phone: branchData.phone?.trim() || null,
        email: branchData.email?.trim() || null,
        established_date: branchData.established_date || null,
        is_active: true,
        member_count: 0,
      } as any),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to create branch');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error creating branch:', err);
        return throwError(() => err);
      }),
    );
  }

  updateBranch(
    branchId: string,
    branchData: Partial<BranchFormData>,
  ): Observable<Branch> {
    const churchId = this.authService.getChurchId();

    // Validate name if provided
    if (branchData.name !== undefined && branchData.name.trim().length < 3) {
      return throwError(
        () => new Error('Branch name must be at least 3 characters'),
      );
    }

    // Validate email if provided
    if (branchData.email && !this.isValidEmail(branchData.email)) {
      return throwError(() => new Error('Invalid email address'));
    }

    // Validate established date if provided
    if (branchData.established_date) {
      const date = new Date(branchData.established_date);
      if (isNaN(date.getTime())) {
        return throwError(() => new Error('Invalid established date'));
      }
      if (date > new Date()) {
        return throwError(
          () => new Error('Established date cannot be in the future'),
        );
      }
    }

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Branch not found or access denied');
        }

        const updateData = {
          ...branchData,
          name: branchData.name?.trim(),
          pastor_name: branchData.pastor_name?.trim() || undefined,
          address: branchData.address?.trim() || undefined,
          city: branchData.city?.trim() || undefined,
          state: branchData.state?.trim() || undefined,
          country: branchData.country?.trim() || undefined,
          phone: branchData.phone?.trim() || undefined,
          email: branchData.email?.trim() || undefined,
          updated_at: new Date().toISOString(),
        };

        return this.supabase.update<Branch>('branches', branchId, updateData);
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to update branch');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error updating branch:', err);
        return throwError(() => err);
      }),
    );
  }

  deleteBranch(branchId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id, name, member_count')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Branch not found or access denied');
        }

        // Soft delete (set is_active to false)
        return this.supabase.update<Branch>('branches', branchId, {
          is_active: false,
          updated_at: new Date().toISOString(),
        });
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => {
        console.error('Error deleting branch:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== BRANCH MEMBERS ====================

  getBranchMembers(
    branchId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Observable<{ data: BranchMember[]; count: number }> {
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('branch_members')
          .select(
            `
            *,
            member:members(
              id,
              first_name,
              last_name,
              middle_name,
              email,
              phone_primary,
              photo_url,
              member_number
            )
          `,
            { count: 'exact' },
          )
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('assigned_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as BranchMember[], count: count || 0 };
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading branch members:', err);
        return throwError(() => err);
      }),
    );
  }

  assignMemberToBranch(
    branchId: string,
    memberId: string,
  ): Observable<BranchMember> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify branch exists and belongs to church
        const { data: branch } = await this.supabase.client
          .from('branches')
          .select('id, is_active')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!branch) {
          throw new Error('Branch not found or access denied');
        }

        if (!branch.is_active) {
          throw new Error('Cannot assign members to inactive branch');
        }

        // Verify member exists and belongs to church
        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        // Check if already assigned
        const { data: existing } = await this.supabase.client
          .from('branch_members')
          .select('id, is_active')
          .eq('branch_id', branchId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          if (existing.is_active) {
            throw new Error('Member is already assigned to this branch');
          } else {
            // Reactivate existing assignment
            const result = await this.supabase.update<BranchMember>(
              'branch_members',
              existing.id,
              { is_active: true, assigned_date: new Date().toISOString() },
            );

            return {
              data: result.data ? result.data[0] : null,
              error: result.error,
            };
          }
        }

        // Create new assignment
        const { data, error } = await this.supabase.insert<BranchMember>(
          'branch_members',
          {
            branch_id: branchId,
            member_id: memberId,
            assigned_date: new Date().toISOString(),
            is_active: true,
          } as any,
        );

        if (error) throw new Error(error.message);

        // Update branch member count
        await this.updateBranchMemberCount(branchId);

        return { data: data ? data[0] : null, error: null };
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Failed to assign member');
        return data;
      }),
      catchError((err) => {
        console.error('Error assigning member:', err);
        return throwError(() => err);
      }),
    );
  }

  removeMemberFromBranch(
    branchMemberId: string,
    branchId: string,
  ): Observable<void> {
    return from(
      (async () => {
        // Soft delete (set is_active to false)
        const { error } = await this.supabase.update<BranchMember>(
          'branch_members',
          branchMemberId,
          {
            is_active: false,
            updated_at: new Date().toISOString(),
          },
        );

        if (error) throw new Error(error.message);

        // Update branch member count
        await this.updateBranchMemberCount(branchId);
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error removing member:', err);
        return throwError(() => err);
      }),
    );
  }

  private async updateBranchMemberCount(branchId: string): Promise<void> {
    const { count } = await this.supabase.client
      .from('branch_members')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('is_active', true);

    await this.supabase.client
      .from('branches')
      .update({
        member_count: count || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', branchId);
  }

  // ==================== STATISTICS ====================

  getBranchStatistics(): Observable<BranchStatistics> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: branches } = await this.supabase.client
          .from('branches')
          .select('*')
          .eq('church_id', churchId);

        if (!branches || branches.length === 0) {
          return {
            total_branches: 0,
            active_branches: 0,
            inactive_branches: 0,
            total_members: 0,
            average_members: 0,
          };
        }

        const activeBranches = branches.filter((b) => b.is_active);
        const totalMembers = branches.reduce(
          (sum, b) => sum + (b.member_count || 0),
          0,
        );

        // Find largest and smallest branches
        const sortedByMembers = [...branches].sort(
          (a, b) => (b.member_count || 0) - (a.member_count || 0),
        );

        return {
          total_branches: branches.length,
          active_branches: activeBranches.length,
          inactive_branches: branches.length - activeBranches.length,
          total_members: totalMembers,
          average_members:
            branches.length > 0
              ? Math.round(totalMembers / branches.length)
              : 0,
          largest_branch:
            sortedByMembers.length > 0
              ? {
                  name: sortedByMembers[0].name,
                  member_count: sortedByMembers[0].member_count || 0,
                }
              : undefined,
          smallest_branch:
            sortedByMembers.length > 0
              ? {
                  name: sortedByMembers[sortedByMembers.length - 1].name,
                  member_count:
                    sortedByMembers[sortedByMembers.length - 1].member_count ||
                    0,
                }
              : undefined,
        };
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== EXPORT ====================

  exportBranches(): Observable<Blob> {
    return this.getBranches(1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) {
          throw new Error('No branches to export');
        }

        const headers = [
          'Branch Name',
          'Pastor/Leader',
          'Address',
          'City',
          'State/Region',
          'Country',
          'Phone',
          'Email',
          'Total Members',
          'Established Date',
          'Status',
          'Created Date',
        ];

        const rows = data.map((branch) => [
          branch.name,
          branch.pastor_name || '',
          branch.address || '',
          branch.city || '',
          branch.state || '',
          branch.country || '',
          branch.phone || '',
          branch.email || '',
          branch.member_count.toString(),
          branch.established_date
            ? new Date(branch.established_date).toLocaleDateString()
            : '',
          branch.is_active ? 'Active' : 'Inactive',
          new Date(branch.created_at).toLocaleDateString(),
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) =>
            row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','),
          ),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => {
        console.error('Export error:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== UTILITY METHODS ====================

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  searchBranches(searchTerm: string): Observable<Branch[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('branches')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .or(
          `name.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%,state.ilike.%${searchTerm}%`,
        )
        .order('name', { ascending: true })
        .limit(20),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Branch[];
      }),
      catchError((err) => {
        console.error('Search error:', err);
        return throwError(() => err);
      }),
    );
  }

  getBranchesForDropdown(): Observable<Branch[]> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('branches')
        .select('id, name, city, member_count')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Branch[];
      }),
      catchError((err) => {
        console.error('Error loading branches dropdown:', err);
        return throwError(() => err);
      }),
    );
  }
}
