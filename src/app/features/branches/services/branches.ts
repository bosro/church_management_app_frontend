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
  BranchInsights,
  AssignBranchPastorRequest,
  BranchPastor,
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
          .select(
            `
            *,
            pastor:profiles!pastor_id(
              id,
              full_name,
              email,
              avatar_url,
              phone_number
            )
          `,
            { count: 'exact' },
          )
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
        .select(
          `
          *,
          pastor:profiles!pastor_id(
            id,
            full_name,
            email,
            avatar_url,
            phone_number
          )
        `,
        )
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

    // Generate slug from name
    const slug = this.generateSlug(branchData.name);

    return from(
      this.supabase.insert<Branch>('branches', {
        church_id: churchId,
        name: branchData.name.trim(),
        slug: slug,
        pastor_name: branchData.pastor_name?.trim() || null,
        pastor_id: branchData.pastor_id || null,
        address: branchData.address?.trim() || null,
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

        const updateData: any = {
          ...branchData,
          name: branchData.name?.trim(),
          pastor_name: branchData.pastor_name?.trim() || null,
          pastor_id: branchData.pastor_id || null,
          address: branchData.address?.trim() || null,
          city: branchData.city?.trim() || null,
          state: branchData.state?.trim() || null,
          country: branchData.country?.trim() || null,
          phone: branchData.phone?.trim() || null,
          email: branchData.email?.trim() || null,
          updated_at: new Date().toISOString(),
        };

        // Update slug if name changed
        if (branchData.name) {
          updateData.slug = this.generateSlug(branchData.name);
        }

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
          .order('created_at', { ascending: false })
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
              { is_active: true, updated_at: new Date().toISOString() },
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
            is_active: true,
          } as any,
        );

        if (error) throw new Error(error.message);

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
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error removing member:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== NEW: BRANCH INSIGHTS ====================

  getBranchInsights(branchId: string): Observable<BranchInsights> {
    return from(
      this.supabase.client.rpc('get_branch_insights', {
        p_branch_id: branchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          throw new Error('No insights available for this branch');
        }
        return data[0] as BranchInsights;
      }),
      catchError((err) => {
        console.error('Error loading branch insights:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== NEW: BRANCH PASTOR MANAGEMENT ====================

  /**
   * Get all profiles with 'pastor' role who are not assigned to any branch
   */
  getAvailablePastors(): Observable<BranchPastor[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Get all pastors
        const { data: allPastors, error: pastorsError } =
          await this.supabase.client
            .from('profiles')
            .select('id, full_name, email, avatar_url, phone_number')
            .eq('church_id', churchId)
            .eq('role', 'pastor')
            .eq('is_active', true)
            .order('full_name', { ascending: true });

        if (pastorsError) throw new Error(pastorsError.message);

        // Get all assigned pastor IDs
        const { data: assignedBranches } = await this.supabase.client
          .from('branches')
          .select('pastor_id')
          .not('pastor_id', 'is', null)
          .eq('is_active', true);

        const assignedPastorIds = new Set(
          (assignedBranches || []).map((b) => b.pastor_id),
        );

        // Filter out already assigned pastors
        const availablePastors = (allPastors || []).filter(
          (pastor) => !assignedPastorIds.has(pastor.id),
        );

        return availablePastors as BranchPastor[];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading available pastors:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Assign a pastor to a branch
   */
  assignBranchPastor(request: AssignBranchPastorRequest): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify branch exists and belongs to church
        const { data: branch } = await this.supabase.client
          .from('branches')
          .select('id, name, pastor_id')
          .eq('id', request.branch_id)
          .eq('church_id', churchId)
          .single();

        if (!branch) {
          throw new Error('Branch not found or access denied');
        }

        if (branch.pastor_id) {
          throw new Error('This branch already has an assigned pastor');
        }

        // Verify profile exists and is a pastor
        const { data: profile } = await this.supabase.client
          .from('profiles')
          .select('id, email, full_name, role')
          .eq('id', request.user_id)
          .eq('church_id', churchId)
          .eq('role', 'pastor')
          .single();

        if (!profile) {
          throw new Error('User not found or is not a pastor');
        }

        // Check if pastor is already assigned to another branch
        const { data: existingAssignment } = await this.supabase.client
          .from('branches')
          .select('id, name')
          .eq('pastor_id', request.user_id)
          .eq('is_active', true)
          .maybeSingle();

        if (existingAssignment) {
          throw new Error(
            `This pastor is already assigned to ${existingAssignment.name}`,
          );
        }

        // Update branch with pastor assignment
        const { error: updateBranchError } = await this.supabase.client
          .from('branches')
          .update({
            pastor_id: request.user_id,
            pastor_name: profile.full_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.branch_id);

        if (updateBranchError) throw new Error(updateBranchError.message);

        // Send welcome email if requested
        if (request.send_welcome_email) {
          try {
            // Call edge function or RPC to send password reset email
            await this.supabase.client.auth.resetPasswordForEmail(
              profile.email,
              {
                redirectTo: `${window.location.origin}/auth/reset-password`,
              },
            );

            console.log('Password reset email sent to:', profile.email);
          } catch (emailErr) {
            console.error('Error sending password reset email:', emailErr);
            // Continue - assignment was successful
          }
        }

        return;
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error assigning branch pastor:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Remove pastor from branch
   */
  removeBranchPastor(branchId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id, pastor_id')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Branch not found or access denied');
        }

        if (!existing.pastor_id) {
          throw new Error('This branch does not have an assigned pastor');
        }

        // Remove pastor from branch
        const { error: branchError } = await this.supabase.client
          .from('branches')
          .update({
            pastor_id: null,
            pastor_name: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', branchId);

        if (branchError) throw new Error(branchError.message);
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error removing branch pastor:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Get branch for current logged-in pastor
   */
  getMyBranch(): Observable<Branch> {
    return from(this.supabase.client.rpc('get_my_branch')).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          throw new Error('No branch assigned to you');
        }
        return data[0] as Branch;
      }),
      catchError((err) => {
        console.error('Error loading my branch:', err);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Check if current user is a branch pastor
   */
  isBranchPastor(): Observable<boolean> {
    return from(this.supabase.client.rpc('is_branch_pastor')).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error checking branch pastor status:', error);
          return false;
        }
        return data as boolean;
      }),
      catchError(() => {
        return from([false]);
      }),
    );
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
          'Slug',
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
          branch.slug,
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

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
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
