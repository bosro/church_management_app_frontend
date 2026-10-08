// src/app/features/members/services/bulk-membership.service.ts
// Adds MANY members to a cell group, a branch or a ministry (department) in a
// few database calls instead of one-by-one. It applies the same rules as the
// existing single-add methods:
//   • everything is scoped to the current church
//   • the target must exist and be active
//   • members already in the target are skipped (reported, not an error)
//   • previously removed (inactive) members are re-activated
import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

export type BulkTargetType = 'cell' | 'branch' | 'ministry';

export interface BulkTarget {
  id: string;
  name: string;
}

export interface BulkResult {
  requested: number;
  added: number; // newly added (or re-activated)
  moved: number; // cells only: moved from a different cell
  alreadyIn: number; // already in the target - skipped
  notFound: number; // not in this church / no longer exists
  failed: number; // blocked by an error (e.g. permissions)
  errors: string[];
}

const CHUNK = 80; // keeps .in() URLs comfortably short

@Injectable({ providedIn: 'root' })
export class BulkMembershipService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  /** Never run a query without a church - everything must stay church-scoped. */
  private requireChurchId(): string {
    const churchId = this.authService.getChurchId();
    if (!churchId) throw new Error('No church found for the current user.');
    return churchId;
  }

  private get db() {
    return this.supabase.client;
  }

  private chunk<T>(items: T[], size = CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  private emptyResult(requested: number): BulkResult {
    return { requested, added: 0, moved: 0, alreadyIn: 0, notFound: 0, failed: 0, errors: [] };
  }

  /** Active cells / branches / ministries of the current church, for the picker. */
  async getTargets(type: BulkTargetType): Promise<BulkTarget[]> {
    const churchId = this.requireChurchId();
    const table = type === 'cell' ? 'cell_groups' : type === 'branch' ? 'branches' : 'ministries';

    const { data, error } = await this.db
      .from(table)
      .select('id, name')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []) as BulkTarget[];
  }

  async addMembers(
    type: BulkTargetType,
    targetId: string,
    memberIds: string[],
  ): Promise<BulkResult> {
    const ids = Array.from(new Set(memberIds));
    if (!targetId) throw new Error('Please choose where to add the members.');
    if (ids.length === 0) throw new Error('No members selected.');

    switch (type) {
      case 'cell':
        return this.addToCell(targetId, ids);
      case 'branch':
        return this.addToBranch(targetId, ids);
      case 'ministry':
        return this.addToMinistry(targetId, ids);
    }
  }

  // ── Members that really exist in this church ───────────────────────────────
  private async validMemberIds(ids: string[], churchId: string): Promise<Set<string>> {
    const valid = new Set<string>();
    for (const part of this.chunk(ids)) {
      const { data, error } = await this.db
        .from('members')
        .select('id')
        .eq('church_id', churchId)
        .in('id', part);
      if (error) throw new Error(error.message);
      (data || []).forEach((m: any) => valid.add(m.id));
    }
    return valid;
  }

  // ── CELL GROUP ─────────────────────────────────────────────────────────────
  private async addToCell(cellId: string, ids: string[]): Promise<BulkResult> {
    const churchId = this.requireChurchId();
    const result = this.emptyResult(ids.length);

    const { data: cell } = await this.db
      .from('cell_groups')
      .select('id, is_active')
      .eq('id', cellId)
      .eq('church_id', churchId)
      .maybeSingle();
    if (!cell) throw new Error('Cell group not found or access denied.');
    if (!cell.is_active) throw new Error('Cannot add members to an inactive cell group.');

    for (const part of this.chunk(ids)) {
      const { data: current, error } = await this.db
        .from('members')
        .select('id, cell_group_id')
        .eq('church_id', churchId)
        .in('id', part);
      if (error) {
        result.failed += part.length;
        result.errors.push(error.message);
        continue;
      }

      const found = current || [];
      result.notFound += part.length - found.length;

      const toUpdate = found.filter((m: any) => m.cell_group_id !== cellId);
      result.alreadyIn += found.length - toUpdate.length;
      if (toUpdate.length === 0) continue;

      const { data: updated, error: updErr } = await this.db
        .from('members')
        .update({ cell_group_id: cellId, updated_at: new Date().toISOString() })
        .eq('church_id', churchId)
        .in('id', toUpdate.map((m: any) => m.id))
        .select('id');

      if (updErr) {
        result.failed += toUpdate.length;
        result.errors.push(updErr.message);
        continue;
      }

      // RLS can silently block rows - count what was REALLY updated
      const updatedIds = new Set((updated || []).map((m: any) => m.id));
      const okRows = toUpdate.filter((m: any) => updatedIds.has(m.id));
      result.added += okRows.length;
      result.moved += okRows.filter((m: any) => m.cell_group_id).length;
      const blocked = toUpdate.length - okRows.length;
      if (blocked > 0) {
        result.failed += blocked;
        result.errors.push(
          `${blocked} member(s) could not be updated (you may not have permission).`,
        );
      }
    }
    return result;
  }

  // ── BRANCH ─────────────────────────────────────────────────────────────────
  private async addToBranch(branchId: string, ids: string[]): Promise<BulkResult> {
    const churchId = this.requireChurchId();
    const result = this.emptyResult(ids.length);

    const { data: branch } = await this.db
      .from('branches')
      .select('id, is_active')
      .eq('id', branchId)
      .eq('church_id', churchId)
      .maybeSingle();
    if (!branch) throw new Error('Branch not found or access denied.');
    if (!branch.is_active) throw new Error('Cannot assign members to an inactive branch.');

    const valid = await this.validMemberIds(ids, churchId);
    result.notFound = ids.length - valid.size;
    const validIds = ids.filter((id) => valid.has(id));
    const changedMemberIds: string[] = []; // newly added or re-activated (for primary-branch sync)

    for (const part of this.chunk(validIds)) {
      const { data: existing, error } = await this.db
        .from('branch_members')
        .select('id, member_id, is_active')
        .eq('branch_id', branchId)
        .in('member_id', part);
      if (error) {
        result.failed += part.length;
        result.errors.push(error.message);
        continue;
      }

      const existingByMember = new Map<string, any>();
      (existing || []).forEach((r: any) => existingByMember.set(r.member_id, r));

      const toInsert = part.filter((id) => !existingByMember.has(id));
      const toReactivate = part.filter((id) => {
        const r = existingByMember.get(id);
        return r && !r.is_active;
      });
      result.alreadyIn += part.filter((id) => {
        const r = existingByMember.get(id);
        return r && r.is_active;
      }).length;

      if (toInsert.length > 0) {
        const { data: inserted, error: insErr } = await this.db
          .from('branch_members')
          .insert(toInsert.map((member_id) => ({ branch_id: branchId, member_id, is_active: true })))
          .select('id');
        if (insErr) {
          result.failed += toInsert.length;
          result.errors.push(insErr.message);
        } else {
          result.added += (inserted || []).length;
          changedMemberIds.push(...toInsert);
        }
      }

      if (toReactivate.length > 0) {
        const rowIds = toReactivate.map((id) => existingByMember.get(id).id);
        const { data: reactivated, error: reErr } = await this.db
          .from('branch_members')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .in('id', rowIds)
          .select('id');
        if (reErr) {
          result.failed += toReactivate.length;
          result.errors.push(reErr.message);
        } else {
          result.added += (reactivated || []).length;
          changedMemberIds.push(...toReactivate);
        }
      }
    }

    // Branch autonomy (only when the church has the switch ON): members.branch_id is the
    // "primary branch" used for scoping, so keep it in step with the assignment.
    if (changedMemberIds.length > 0 && this.authService.hasChurchFeature('branch_autonomy')) {
      for (const part of this.chunk(changedMemberIds)) {
        const { error: syncErr } = await this.db
          .from('members')
          .update({ branch_id: branchId, updated_at: new Date().toISOString() })
          .eq('church_id', churchId)
          .in('id', part);
        if (syncErr) result.errors.push('Primary branch not updated: ' + syncErr.message);
      }
    }

    // branches.member_count is kept in sync by the sync_branch_member_count trigger
    return result;
  }

  // ── MINISTRY / DEPARTMENT ──────────────────────────────────────────────────
  private async addToMinistry(ministryId: string, ids: string[]): Promise<BulkResult> {
    const churchId = this.requireChurchId();
    const result = this.emptyResult(ids.length);

    const { data: ministry } = await this.db
      .from('ministries')
      .select('id, is_active')
      .eq('id', ministryId)
      .eq('church_id', churchId)
      .maybeSingle();
    if (!ministry) throw new Error('Ministry not found or access denied.');
    if (!ministry.is_active) throw new Error('Cannot add members to an inactive ministry.');

    const valid = await this.validMemberIds(ids, churchId);
    result.notFound = ids.length - valid.size;
    const validIds = ids.filter((id) => valid.has(id));
    const today = new Date().toISOString().split('T')[0];

    for (const part of this.chunk(validIds)) {
      const { data: existing, error } = await this.db
        .from('ministry_members')
        .select('id, member_id, is_active')
        .eq('ministry_id', ministryId)
        .in('member_id', part);
      if (error) {
        result.failed += part.length;
        result.errors.push(error.message);
        continue;
      }

      const existingByMember = new Map<string, any>();
      (existing || []).forEach((r: any) => existingByMember.set(r.member_id, r));

      const toInsert = part.filter((id) => !existingByMember.has(id));
      const toReactivate = part.filter((id) => {
        const r = existingByMember.get(id);
        return r && !r.is_active;
      });
      result.alreadyIn += part.filter((id) => {
        const r = existingByMember.get(id);
        return r && r.is_active;
      }).length;

      if (toInsert.length > 0) {
        const { data: inserted, error: insErr } = await this.db
          .from('ministry_members')
          .insert(
            toInsert.map((member_id) => ({
              ministry_id: ministryId,
              member_id,
              role: null,
              joined_date: today,
              is_active: true,
            })),
          )
          .select('id');
        if (insErr) {
          result.failed += toInsert.length;
          result.errors.push(insErr.message);
        } else {
          result.added += (inserted || []).length;
        }
      }

      if (toReactivate.length > 0) {
        const rowIds = toReactivate.map((id) => existingByMember.get(id).id);
        const { data: reactivated, error: reErr } = await this.db
          .from('ministry_members')
          .update({ is_active: true, joined_date: today })
          .in('id', rowIds)
          .select('id');
        if (reErr) {
          result.failed += toReactivate.length;
          result.errors.push(reErr.message);
        } else {
          result.added += (reactivated || []).length;
        }
      }
    }

    // Same as MinistryService.updateMemberCount(): recount active members once
    if (result.added > 0) {
      const { count } = await this.db
        .from('ministry_members')
        .select('*', { count: 'exact', head: true })
        .eq('ministry_id', ministryId)
        .eq('is_active', true);
      await this.db
        .from('ministries')
        .update({ member_count: count || 0, updated_at: new Date().toISOString() })
        .eq('id', ministryId);
    }
    return result;
  }
}
