
// src/app/features/branches/services/branches.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { Branch, BranchMember } from '../../../models/branch.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class BranchesService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // BRANCHES CRUD
  getBranches(
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ data: Branch[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('branches')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .order('name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Branch[], count: count || 0 };
      })()
    );
  }

  getBranchById(branchId: string): Observable<Branch> {
    return from(
      this.supabase.query<Branch>('branches', {
        filters: { id: branchId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Branch not found');
        return data[0];
      })
    );
  }

  createBranch(branchData: Partial<Branch>): Observable<Branch> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<Branch>('branches', {
        ...branchData,
        church_id: churchId,
        is_active: true,
        member_count: 0
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateBranch(branchId: string, branchData: Partial<Branch>): Observable<Branch> {
    return from(
      this.supabase.update<Branch>('branches', branchId, branchData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteBranch(branchId: string): Observable<void> {
    return from(
      this.supabase.update<Branch>('branches', branchId, { is_active: false })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // BRANCH MEMBERS
  getBranchMembers(
    branchId: string,
    page: number = 1,
    pageSize: number = 50
  ): Observable<{ data: BranchMember[], count: number }> {
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('branch_members')
          .select(`
            *,
            member:members(id, first_name, last_name, email, phone_primary, photo_url)
          `, { count: 'exact' })
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('assigned_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as BranchMember[], count: count || 0 };
      })()
    );
  }

  assignMemberToBranch(branchId: string, memberId: string): Observable<BranchMember> {
    return from(
      this.supabase.insert<BranchMember>('branch_members', {
        branch_id: branchId,
        member_id: memberId,
        is_active: true
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        // Update branch member count
        this.updateBranchMemberCount(branchId);

        return data![0];
      })
    );
  }

  removeMemberFromBranch(branchMemberId: string, branchId: string): Observable<void> {
    return from(
      this.supabase.update<BranchMember>('branch_members', branchMemberId, { is_active: false })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;

        // Update branch member count
        this.updateBranchMemberCount(branchId);
      })
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
      .update({ member_count: count || 0 })
      .eq('id', branchId);
  }

  // STATISTICS
  getBranchStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: branches } = await this.supabase.client
          .from('branches')
          .select('*')
          .eq('church_id', churchId)
          .eq('is_active', true);

        const totalBranches = branches?.length || 0;
        const totalMembers = branches?.reduce((sum, b) => sum + (b.member_count || 0), 0) || 0;
        const activeBranches = branches?.filter(b => b.is_active).length || 0;

        return {
          total_branches: totalBranches,
          active_branches: activeBranches,
          total_members: totalMembers,
          average_members: totalBranches > 0 ? Math.round(totalMembers / totalBranches) : 0
        };
      })()
    );
  }

  // EXPORT
  exportBranches(): Observable<Blob> {
    return this.getBranches(1, 10000).pipe(
      map(({ data }) => {
        if (data.length === 0) {
          throw new Error('No branches to export');
        }

        const headers = [
          'Branch Name',
          'Pastor',
          'Address',
          'City',
          'State',
          'Country',
          'Phone',
          'Email',
          'Members',
          'Established Date',
          'Status'
        ];

        const rows = data.map(branch => [
          branch.name,
          branch.pastor_name || '',
          branch.address || '',
          branch.city || '',
          branch.state || '',
          branch.country || '',
          branch.phone || '',
          branch.email || '',
          branch.member_count.toString(),
          branch.established_date || '',
          branch.is_active ? 'Active' : 'Inactive'
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      })
    );
  }
}
