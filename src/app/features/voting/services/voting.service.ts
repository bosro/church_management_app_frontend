// src/app/features/voting/services/voting.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  VotingCategory, VotingNominee, VotingVote,
  VotingCategoryFormData, NomineeFormData
} from '../../../models/voting.model';

@Injectable({ providedIn: 'root' })
export class VotingService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  private get churchId() { return this.authService.getChurchId(); }
 private get userId() { return this.authService.getUserId(); }

  // ── CATEGORIES ────────────────────────────────────────

  getCategories(): Observable<VotingCategory[]> {
    return from(
      this.supabase.client
        .from('voting_categories')
        .select('*')
        .eq('church_id', this.churchId)
        .order('voting_start_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map(c => this.enrichCategory(c));
      }),
      catchError(err => throwError(() => err))
    );
  }

  getCategoryById(id: string): Observable<VotingCategory> {
    return from(
      this.supabase.client
        .from('voting_categories')
        .select('*')
        .eq('id', id)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichCategory(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  createCategory(formData: VotingCategoryFormData): Observable<VotingCategory> {
    return from(
      this.supabase.client
        .from('voting_categories')
        .insert({
          ...formData,
          church_id: this.churchId,
          created_by: this.userId,
          is_active: true,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichCategory(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateCategory(id: string, formData: Partial<VotingCategoryFormData>): Observable<VotingCategory> {
    return from(
      this.supabase.client
        .from('voting_categories')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return this.enrichCategory(data);
      }),
      catchError(err => throwError(() => err))
    );
  }

  deleteCategory(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('voting_categories')
        .delete()
        .eq('id', id)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  // ── NOMINEES ──────────────────────────────────────────

  getNominees(categoryId: string): Observable<VotingNominee[]> {
    return from(
      (async () => {
        const [nomineesRes, votesRes] = await Promise.all([
          this.supabase.client
            .from('voting_nominees')
            .select('*')
            .eq('category_id', categoryId)
            .eq('is_approved', true)
            .order('vote_count', { ascending: false }),
          this.supabase.client
            .from('voting_votes')
            .select('nominee_id')
            .eq('category_id', categoryId)
            .eq('voter_id', this.userId)
        ]);

        if (nomineesRes.error) throw new Error(nomineesRes.error.message);

        const votedIds = new Set((votesRes.data || []).map(v => v.nominee_id));

        return (nomineesRes.data || []).map(n => ({
          ...n,
          has_voted: votedIds.has(n.id)
        })) as VotingNominee[];
      })()
    ).pipe(catchError(err => throwError(() => err)));
  }

  getAllNominees(categoryId: string): Observable<VotingNominee[]> {
    // For admin — includes unapproved
    return from(
      this.supabase.client
        .from('voting_nominees')
        .select('*')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as VotingNominee[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  addNominee(categoryId: string, formData: NomineeFormData): Observable<VotingNominee> {
    return from(
      this.supabase.client
        .from('voting_nominees')
        .insert({
          ...formData,
          category_id: categoryId,
          church_id: this.churchId,
          nominated_by: this.userId,
          is_approved: false,
          vote_count: 0,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as VotingNominee;
      }),
      catchError(err => throwError(() => err))
    );
  }

  approveNominee(nomineeId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('voting_nominees')
        .update({ is_approved: true, updated_at: new Date().toISOString() })
        .eq('id', nomineeId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  deleteNominee(nomineeId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('voting_nominees')
        .delete()
        .eq('id', nomineeId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  // ── VOTES ─────────────────────────────────────────────

  castVote(categoryId: string, nomineeId: string): Observable<void> {
    return from(
      (async () => {
        // Check vote limit
        const { count } = await this.supabase.client
          .from('voting_votes')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', categoryId)
          .eq('voter_id', this.userId);

        const { data: category } = await this.supabase.client
          .from('voting_categories')
          .select('max_votes_per_user')
          .eq('id', categoryId)
          .single();

        if ((count || 0) >= (category?.max_votes_per_user || 1)) {
          throw new Error(`You have used all your votes for this category`);
        }

        const { error } = await this.supabase.client
          .from('voting_votes')
          .insert({
            category_id: categoryId,
            nominee_id: nomineeId,
            voter_id: this.userId,
            church_id: this.churchId,
          });

        if (error) {
          if (error.code === '23505') throw new Error('You already voted for this nominee');
          throw new Error(error.message);
        }
      })()
    ).pipe(catchError(err => throwError(() => err)));
  }

  removeVote(categoryId: string, nomineeId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('voting_votes')
        .delete()
        .eq('category_id', categoryId)
        .eq('nominee_id', nomineeId)
        .eq('voter_id', this.userId)
    ).pipe(
      map(({ error }) => { if (error) throw new Error(error.message); }),
      catchError(err => throwError(() => err))
    );
  }

  getUserVoteCount(categoryId: string): Observable<number> {
    return from(
      this.supabase.client
        .from('voting_votes')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('voter_id', this.userId)
    ).pipe(
      map(({ count, error }) => {
        if (error) throw new Error(error.message);
        return count || 0;
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ── HELPERS ───────────────────────────────────────────

  private enrichCategory(c: any): VotingCategory {
    const now = new Date();
    const start = new Date(c.voting_start_at);
    const end = new Date(c.voting_end_at);
    const nomStart = c.nominations_start_at ? new Date(c.nominations_start_at) : null;
    const nomEnd = c.nominations_end_at ? new Date(c.nominations_end_at) : null;

    let status: VotingCategory['status'] = 'upcoming';
    if (now > end) status = 'closed';
    else if (now >= start && now <= end) status = 'voting_open';
    else if (nomStart && nomEnd && now >= nomStart && now <= nomEnd) status = 'nominations_open';

    return { ...c, status };
  }
}
