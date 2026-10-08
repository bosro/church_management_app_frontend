// src/app/features/communications/services/recipient-groups.service.ts
// Saved recipient groups for Communications ("Choir", "Youth leaders", ...).
// A saved group simply loads into the existing Custom List, so sending is
// unchanged (custom_member_ids → send-communication edge function).
import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { Member } from '../../../models/member.model';

export type ImportSourceType = 'cell' | 'branch' | 'ministry';

export interface RecipientGroup {
  id: string;
  name: string;
  description?: string | null;
  member_count: number;
  updated_at: string;
}

export interface LoadedMembers {
  members: Member[];
  skipped: number; // deceased / transferred members left out
}

const MEMBER_COLUMNS =
  'id, church_id, first_name, last_name, member_number, phone_primary, email, photo_url, membership_status';

// People who should never receive church messages
const EXCLUDED_STATUSES = ['deceased', 'transferred'];

@Injectable({ providedIn: 'root' })
export class RecipientGroupsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  private requireChurchId(): string {
    const churchId = this.authService.getChurchId();
    if (!churchId) throw new Error('No church found for the current user.');
    return churchId;
  }

  private cleanMembers(rows: any[]): LoadedMembers {
    const all = rows.filter((m) => !!m);
    const kept = all.filter((m) => !EXCLUDED_STATUSES.includes(m.membership_status));
    return { members: kept as Member[], skipped: all.length - kept.length };
  }

  // ── Groups ─────────────────────────────────────────────────────────────────
  async listGroups(): Promise<RecipientGroup[]> {
    const churchId = this.requireChurchId();
    const { data, error } = await this.db
      .from('recipient_groups')
      .select('id, name, description, updated_at, recipient_group_members(count)')
      .eq('church_id', churchId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      updated_at: g.updated_at,
      member_count: g.recipient_group_members?.[0]?.count ?? 0,
    }));
  }

  async getGroupMembers(groupId: string): Promise<LoadedMembers> {
    const { data, error } = await this.db
      .from('recipient_group_members')
      .select(`members(${MEMBER_COLUMNS})`)
      .eq('group_id', groupId);

    if (error) throw new Error(error.message);
    return this.cleanMembers((data || []).map((r: any) => r.members));
  }

  /** Create (groupId = null) or update a group together with its members, atomically. */
  async saveGroup(groupId: string | null, name: string, memberIds: string[]): Promise<string> {
    const { data, error } = await this.db.rpc('save_recipient_group', {
      p_group_id: groupId,
      p_name: name,
      p_member_ids: Array.from(new Set(memberIds)),
    });

    if (error) {
      if ((error as any).code === '23505') {
        throw new Error('A group with that name already exists. Choose a different name.');
      }
      throw new Error(error.message);
    }
    return data as string;
  }

  async deleteGroup(groupId: string): Promise<void> {
    const churchId = this.requireChurchId();
    const { error } = await this.db
      .from('recipient_groups')
      .delete()
      .eq('id', groupId)
      .eq('church_id', churchId);
    if (error) throw new Error(error.message);
  }

  // ── Import everyone from an existing cell / branch / ministry ──────────────
  async getMembersOfTarget(type: ImportSourceType, targetId: string): Promise<LoadedMembers> {
    const churchId = this.requireChurchId();

    if (type === 'cell') {
      const { data, error } = await this.db
        .from('members')
        .select(MEMBER_COLUMNS)
        .eq('church_id', churchId)
        .eq('cell_group_id', targetId)
        .order('first_name', { ascending: true });
      if (error) throw new Error(error.message);
      return this.cleanMembers(data || []);
    }

    const joinTable = type === 'branch' ? 'branch_members' : 'ministry_members';
    const fk = type === 'branch' ? 'branch_id' : 'ministry_id';

    const { data, error } = await this.db
      .from(joinTable)
      .select(`members!inner(${MEMBER_COLUMNS})`)
      .eq(fk, targetId)
      .eq('is_active', true)
      .eq('members.church_id', churchId);
    if (error) throw new Error(error.message);
    return this.cleanMembers((data || []).map((r: any) => r.members));
  }
}
