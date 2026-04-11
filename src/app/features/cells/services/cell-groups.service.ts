// src/app/features/cells/services/cell-groups.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  CellGroup,
  CellGroupCreateInput,
  CellGroupUpdateInput,
} from '../../../models/cell-group.model';

@Injectable({ providedIn: 'root' })
export class CellGroupsService {

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private getChurchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found. Please log in again.');
    return id;
  }

  getCellGroups(): Observable<CellGroup[]> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('cell_groups_with_leader')
        .select('*')
        .eq('church_id', churchId)
        .order('name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as CellGroup[];
      }),
      catchError(err => throwError(() => err)),
    );
  }

  // Used by member add/edit dropdowns — only active groups
  getActiveCellGroups(): Observable<CellGroup[]> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('cell_groups')
        .select('id, name, meeting_day, branch_id')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as CellGroup[];
      }),
      catchError(() => of([])),
    );
  }

  createCellGroup(input: CellGroupCreateInput): Observable<CellGroup> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('cell_groups')
        .insert({
          ...input,
          church_id: churchId,
          is_active: true,
          leader_id: input.leader_id || null,
          branch_id: input.branch_id || null,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as CellGroup;
      }),
      catchError(err => throwError(() => err)),
    );
  }

  updateCellGroup(id: string, input: CellGroupUpdateInput): Observable<CellGroup> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('cell_groups')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', churchId)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as CellGroup;
      }),
      catchError(err => throwError(() => err)),
    );
  }

  deactivateCellGroup(id: string): Observable<void> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('cell_groups')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err)),
    );
  }

  getCellLeaders(): Observable<any[]> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, full_name, email, avatar_url, role')
        .eq('church_id', churchId)
        .in('role', [
          'cell_leader', 'group_leader', 'pastor',
          'senior_pastor', 'associate_pastor', 'church_admin',
        ])
        .eq('is_active', true)
        .order('full_name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data || [];
      }),
      catchError(() => of([])),
    );
  }

  getCellGroupMembers(cellGroupId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('members')
        .select(
          'id, first_name, last_name, phone_primary, email, photo_url, membership_status',
        )
        .eq('cell_group_id', cellGroupId)
        .order('first_name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data || [];
      }),
      catchError(() => of([])),
    );
  }
}
