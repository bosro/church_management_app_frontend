// src/app/features/branches/services/branches.service.ts
// KEY FIX: getBranchMembers() now scopes by church_id for defensive safety.
// All other logic is unchanged from your original.
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

  private getChurchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found. Please log in again.');
    return id;
  }

  // ==================== BRANCHES CRUD ====================

  getBranches(
    page: number = 1,
    pageSize: number = 20,
    filters?: { isActive?: boolean; city?: string; state?: string },
  ): Observable<{ data: Branch[]; count: number }> {
    const churchId = this.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('branches')
          .select(
            `*, pastor:profiles!pastor_id(
              id, full_name, email, avatar_url, phone_number
            )`,
            { count: 'exact' },
          )
          .eq('church_id', churchId);

        if (filters?.isActive !== undefined)
          query = query.eq('is_active', filters.isActive);
        if (filters?.city) query = query.ilike('city', `%${filters.city}%`);
        if (filters?.state) query = query.ilike('state', `%${filters.state}%`);

        const { data, error, count } = await query
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as Branch[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getBranchById(branchId: string): Observable<Branch> {
    const churchId = this.getChurchId();

    return from(
      this.supabase.client
        .from('branches')
        .select(
          `*, pastor:profiles!pastor_id(
            id, full_name, email, avatar_url, phone_number
          )`,
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
      catchError((err) => throwError(() => err)),
    );
  }

  createBranch(branchData: BranchFormData): Observable<Branch> {
    const churchId = this.getChurchId();

    if (!branchData.name || branchData.name.trim().length < 3) {
      return throwError(
        () => new Error('Branch name must be at least 3 characters'),
      );
    }
    if (branchData.email && !this.isValidEmail(branchData.email)) {
      return throwError(() => new Error('Invalid email address'));
    }

    const slug = this.generateSlug(branchData.name);

    return from(
      this.supabase.insert<Branch>('branches', {
        church_id: churchId,
        name: branchData.name.trim(),
        slug,
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
      catchError((err) => throwError(() => err)),
    );
  }

  updateBranch(
    branchId: string,
    branchData: Partial<BranchFormData>,
  ): Observable<Branch> {
    const churchId = this.getChurchId();

    if (branchData.name !== undefined && branchData.name.trim().length < 3) {
      return throwError(
        () => new Error('Branch name must be at least 3 characters'),
      );
    }
    if (branchData.email && !this.isValidEmail(branchData.email)) {
      return throwError(() => new Error('Invalid email address'));
    }

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Branch not found or access denied');

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
      catchError((err) => throwError(() => err)),
    );
  }

  deleteBranch(branchId: string): Observable<void> {
    const churchId = this.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id, name, member_count')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Branch not found or access denied');

        return this.supabase.update<Branch>('branches', branchId, {
          is_active: false,
          updated_at: new Date().toISOString(),
        });
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== BRANCH MEMBERS ====================

  getBranchMembers(
    branchId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Observable<{ data: BranchMember[]; count: number }> {
    // FIX: added church_id scoping for defensive safety
    const churchId = this.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        // First get the branch to verify church ownership
        const { data: branch } = await this.supabase.client
          .from('branches')
          .select('id')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!branch) throw new Error('Branch not found or access denied');

        const { data, error, count } = await this.supabase.client
          .from('branch_members')
          .select(
            `*, member:members(
              id, first_name, last_name, middle_name,
              email, phone_primary, photo_url, member_number
            )`,
            { count: 'exact' },
          )
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as BranchMember[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  assignMemberToBranch(
    branchId: string,
    memberId: string,
  ): Observable<BranchMember> {
    const churchId = this.getChurchId();

    return from(
      (async () => {
        const { data: branch } = await this.supabase.client
          .from('branches')
          .select('id, is_active')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!branch) throw new Error('Branch not found or access denied');
        if (!branch.is_active)
          throw new Error('Cannot assign members to inactive branch');

        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) throw new Error('Member not found');

        const { data: existing } = await this.supabase.client
          .from('branch_members')
          .select('id, is_active')
          .eq('branch_id', branchId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          if (existing.is_active)
            throw new Error('Member is already assigned to this branch');
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

        const { data, error } = await this.supabase.insert<BranchMember>(
          'branch_members',
          { branch_id: branchId, member_id: memberId, is_active: true } as any,
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
      catchError((err) => throwError(() => err)),
    );
  }

  removeMemberFromBranch(
    branchMemberId: string,
    branchId: string,
  ): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.update<BranchMember>(
          'branch_members',
          branchMemberId,
          { is_active: false, updated_at: new Date().toISOString() },
        );
        if (error) throw new Error(error.message);
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== BRANCH INSIGHTS ====================

  getBranchInsights(branchId: string): Observable<BranchInsights> {
    return from(
      this.supabase.client.rpc('get_branch_insights', {
        p_branch_id: branchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('No insights available for this branch');
        return data[0] as BranchInsights;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== BRANCH PASTOR MANAGEMENT ====================

  getAvailablePastors(): Observable<BranchPastor[]> {
    const churchId = this.getChurchId();

    return from(
      (async () => {
        const { data: allUsers, error: usersError } = await this.supabase.client
          .from('profiles')
          .select(
            'id, full_name, email, phone_number, avatar_url, role, branch_id',
          )
          .eq('church_id', churchId)
          .eq('is_active', true)
          .not('role', 'in', '("member","super_admin","church_admin")')
          .order('full_name', { ascending: true });

        if (usersError) throw new Error(usersError.message);

        const { data: assignedBranches } = await this.supabase.client
          .from('branches')
          .select('pastor_id')
          .not('pastor_id', 'is', null)
          .eq('church_id', churchId)
          .eq('is_active', true);

        const assignedPastorIds = new Set(
          (assignedBranches || []).map((b) => b.pastor_id),
        );

        return (allUsers || [])
          .filter((u) => !assignedPastorIds.has(u.id))
          .map((u) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            phone_number: u.phone_number,
            avatar_url: u.avatar_url || null,
            role: u.role,
          })) as BranchPastor[];
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  assignBranchPastor(request: AssignBranchPastorRequest): Observable<void> {
    const churchId = this.getChurchId();

    return from(
      (async () => {
        const { data: branch } = await this.supabase.client
          .from('branches')
          .select('id, name, pastor_id')
          .eq('id', request.branch_id)
          .eq('church_id', churchId)
          .single();

        if (!branch) throw new Error('Branch not found or access denied');
        if (branch.pastor_id)
          throw new Error('This branch already has an assigned pastor');

        const { data: userRecord } = await this.supabase.client
          .from('profiles')
          .select('id, email, full_name, role')
          .eq('id', request.user_id)
          .eq('church_id', churchId)
          .eq('is_active', true)
          .single();

        if (!userRecord) throw new Error('User not found');

        const blockedRoles = ['member', 'super_admin', 'church_admin'];
        if (blockedRoles.includes(userRecord.role)) {
          throw new Error('This user cannot be assigned as a branch leader');
        }

        const { data: existingAssignment } = await this.supabase.client
          .from('branches')
          .select('id, name')
          .eq('pastor_id', request.user_id)
          .eq('is_active', true)
          .maybeSingle();

        if (existingAssignment) {
          throw new Error(
            `This person is already assigned to "${existingAssignment.name}"`,
          );
        }

        const { error: updateBranchError } = await this.supabase.client
          .from('branches')
          .update({
            pastor_id: request.user_id,
            pastor_name: userRecord.full_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.branch_id);

        if (updateBranchError) throw new Error(updateBranchError.message);

        const { error: profileError } = await this.supabase.client
          .from('profiles')
          .update({
            branch_id: request.branch_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.user_id);

        if (profileError) throw new Error(profileError.message);
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  removeBranchPastor(branchId: string): Observable<void> {
    const churchId = this.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('branches')
          .select('id, pastor_id')
          .eq('id', branchId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Branch not found or access denied');
        if (!existing.pastor_id)
          throw new Error('This branch does not have an assigned pastor');

        const { error: branchError } = await this.supabase.client
          .from('branches')
          .update({
            pastor_id: null,
            pastor_name: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', branchId);

        if (branchError) throw new Error(branchError.message);

        const { error: profileError } = await this.supabase.client
          .from('profiles')
          .update({ branch_id: null, updated_at: new Date().toISOString() })
          .eq('id', existing.pastor_id);

        if (profileError) throw new Error(profileError.message);
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getMyBranch(): Observable<Branch> {
    return from(this.supabase.client.rpc('get_my_branch')).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('No branch assigned to you');
        return data[0] as Branch;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  isBranchPastor(): Observable<boolean> {
    return from(this.supabase.client.rpc('is_branch_pastor')).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error checking branch pastor status:', error);
          return false;
        }
        return data as boolean;
      }),
      catchError(() => from([false])),
    );
  }

  // ==================== STATISTICS ====================

  getBranchStatistics(): Observable<BranchStatistics> {
    const churchId = this.getChurchId();

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
        const sortedByMembers = [...branches].sort(
          (a, b) => (b.member_count || 0) - (a.member_count || 0),
        );

        return {
          total_branches: branches.length,
          active_branches: activeBranches.length,
          inactive_branches: branches.length - activeBranches.length,
          total_members: totalMembers,
          average_members: branches.length
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
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== EXPORT ====================

  exportBranches(): Observable<Blob> {
    return this.getBranches(1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) throw new Error('No branches to export');

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
            row
              .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(','),
          ),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== SEARCH / DROPDOWN ====================

  searchBranches(searchTerm: string): Observable<Branch[]> {
    const churchId = this.getChurchId();
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
      catchError((err) => throwError(() => err)),
    );
  }

  getBranchesForDropdown(): Observable<Branch[]> {
    const churchId = this.getChurchId();
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
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== UTILITY ====================

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
