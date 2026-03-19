// src/app/features/members/services/member.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  Member,
  MemberSearchFilters,
  MemberStatistics,
  ImportResult,
  MemberCreateInput,
  MemberUpdateInput,
  MemberListResult,
} from '../../../models/member.model';
import { SubscriptionService } from '../../../core/services/subscription.service';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
  ) {}

  // Always get fresh values — never store in constructor
  private getChurchId(): string {
    const id = this.authService.getChurchId();
    if (!id) throw new Error('Church ID not found. Please log in again.');
    return id;
  }

  getMembers(
    filters: MemberSearchFilters = {},
    page: number = 1,
    pageSize: number = 20,
  ): Observable<MemberListResult> {
    return from(this.fetchMembers(filters, page, pageSize));
  }

  private async fetchMembers(
    filters: MemberSearchFilters,
    page: number,
    pageSize: number,
  ): Promise<MemberListResult> {
    const churchId = this.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    let query = this.supabase.client
      .from('members')
      .select('*', { count: 'exact' })
      .eq('church_id', churchId);

    // Branch pastor only sees their branch members
    if (isBranchPastor && branchId) {
      query = query.eq('branch_id', branchId);
    }

    if (filters.search_term) {
      query = query.or(
        `first_name.ilike.%${filters.search_term}%,last_name.ilike.%${filters.search_term}%,email.ilike.%${filters.search_term}%,phone_primary.ilike.%${filters.search_term}%,member_number.ilike.%${filters.search_term}%`,
      );
    }
    if (filters.gender_filter)
      query = query.eq('gender', filters.gender_filter);
    if (filters.status_filter)
      query = query.eq('membership_status', filters.status_filter);
    if (filters.branch_filter)
      query = query.eq('branch_id', filters.branch_filter);

    const offset = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    return {
      data: (data || []) as Member[],
      count: count || 0,
      page,
      pageSize,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    };
  }

  getMemberById(id: string): Observable<Member> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('members')
        .select('*')
        .eq('id', id)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Member not found');
        return data as Member;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  createMember(memberData: MemberCreateInput): Observable<Member> {
    const churchId = this.getChurchId();
    const branchId = this.authService.getBranchId();

    // Check quota before inserting
    return this.subscriptionService.checkQuota('members').pipe(
      switchMap((quota) => {
        if (!quota.allowed) {
          throw new Error(
            `QUOTA_EXCEEDED:members:${quota.current}:${quota.limit}`,
          );
        }
        return from(
          this.supabase.client
            .from('members')
            .insert({
              ...memberData,
              church_id: churchId,
              branch_id: memberData.branch_id || branchId || null,
              membership_status: 'active' as const,
              is_new_convert: memberData.is_new_convert || false,
              is_visitor: memberData.is_visitor || false,
            })
            .select()
            .single(),
        );
      }),
      map(({ data: member, error }: any) => {
        if (error) throw new Error(error.message);
        if (!member) throw new Error('Failed to create member');
        return member as Member;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  updateMember(id: string, memberData: MemberUpdateInput): Observable<Member> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('members')
        .update({ ...memberData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('church_id', churchId)
        .select()
        .single(),
    ).pipe(
      map(({ data: member, error }) => {
        if (error) throw new Error(error.message);
        if (!member) throw new Error('Failed to update member');
        return member as Member;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteMember(id: string): Observable<void> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('members')
        .update({
          membership_status: 'inactive' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  uploadMemberPhoto(memberId: string, file: File): Observable<string> {
    return from(this.uploadPhoto(memberId, file));
  }

  private async uploadPhoto(memberId: string, file: File): Promise<string> {
    const churchId = this.getChurchId();
    const fileExt = file.name.split('.').pop();
    const fileName = `${memberId}_${Date.now()}.${fileExt}`;
    const filePath = `members/${churchId}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('member-photos')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = this.supabase.client.storage
      .from('member-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  getMemberStatistics(): Observable<MemberStatistics> {
    const churchId = this.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    // Branch pastors get branch-level stats, admins get church-wide
    if (isBranchPastor && branchId) {
      return from(this.fetchBranchMemberStats(churchId, branchId));
    }

    return from(
      this.supabase.client.rpc('get_membership_stats', {
        church_uuid: churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        const stats = typeof data === 'string' ? JSON.parse(data) : data;
        return {
          total_members: stats.total_members || 0,
          active_members: stats.active_members || 0,
          inactive_members: stats.inactive_members || 0,
          new_members_this_month: stats.new_members_this_month || 0,
          new_members_this_year: stats.new_members_this_year || 0,
          male_members: stats.male_members || 0,
          female_members: stats.female_members || 0,
          avg_age: stats.avg_age || undefined,
        } as MemberStatistics;
      }),
      catchError(() =>
        of({
          total_members: 0,
          active_members: 0,
          inactive_members: 0,
          new_members_this_month: 0,
          new_members_this_year: 0,
          male_members: 0,
          female_members: 0,
        } as MemberStatistics),
      ),
    );
  }

  private async fetchBranchMemberStats(
    churchId: string,
    branchId: string,
  ): Promise<MemberStatistics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const startOfYear = new Date(now.getFullYear(), 0, 1)
      .toISOString()
      .split('T')[0];

    const { data: members } = await this.supabase.client
      .from('members')
      .select('membership_status, gender, created_at')
      .eq('church_id', churchId)
      .eq('branch_id', branchId);

    const all = members || [];
    return {
      total_members: all.length,
      active_members: all.filter((m) => m.membership_status === 'active')
        .length,
      inactive_members: all.filter((m) => m.membership_status === 'inactive')
        .length,
      new_members_this_month: all.filter((m) => m.created_at >= startOfMonth)
        .length,
      new_members_this_year: all.filter((m) => m.created_at >= startOfYear)
        .length,
      male_members: all.filter((m) => m.gender === 'male').length,
      female_members: all.filter((m) => m.gender === 'female').length,
    };
  }

  exportMembersToCSV(filters: MemberSearchFilters = {}): Observable<Blob> {
    return this.getMembers(filters, 1, 10000).pipe(
      map(({ data: members }) => {
        const headers = [
          'Member Number',
          'First Name',
          'Middle Name',
          'Last Name',
          'Email',
          'Phone',
          'Gender',
          'Date of Birth',
          'Marital Status',
          'Address',
          'City',
          'Occupation',
          'Join Date',
          'Status',
        ];
        const rows = members.map((m) => [
          this.escapeCsvValue(m.member_number),
          this.escapeCsvValue(m.first_name),
          this.escapeCsvValue(m.middle_name || ''),
          this.escapeCsvValue(m.last_name),
          this.escapeCsvValue(m.email || ''),
          this.escapeCsvValue(m.phone_primary || ''),
          this.escapeCsvValue(m.gender || ''),
          this.escapeCsvValue(m.date_of_birth || ''),
          this.escapeCsvValue(m.marital_status || ''),
          this.escapeCsvValue(m.address || ''),
          this.escapeCsvValue(m.city || ''),
          this.escapeCsvValue(m.occupation || ''),
          this.escapeCsvValue(m.join_date),
          this.escapeCsvValue(m.membership_status),
        ]);
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join(
          '\n',
        );
        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
    );
  }

  private escapeCsvValue(value: string | undefined | null): string {
    if (!value) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  importMembersFromCSV(file: File): Observable<ImportResult> {
    return from(this.processCSVImport(file));
  }

  private async processCSVImport(file: File): Promise<ImportResult> {
    const churchId = this.getChurchId();
    const branchId = this.authService.getBranchId();
    const text = await file.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (lines.length < 2) throw new Error('CSV file is empty or invalid');

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    // Parse headers and normalize them
    const headers = this.parseCSVLine(lines[0]).map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
    );

    // Header name aliases — maps any variation to a canonical key
    const headerAliases: Record<string, string> = {
      first_name: 'first_name',
      last_name: 'last_name',
      email: 'email',
      phone: 'phone',
      phone_number: 'phone',
      phonenumber: 'phone',
      gender: 'gender',
      date_of_birth: 'date_of_birth',
      dob: 'date_of_birth',
      dateofbirth: 'date_of_birth',
      join_date: 'join_date',
      joindate: 'join_date',
      address: 'address',
      city: 'city',
      title: 'title',
      cell_group: 'cell_group',
      cellgroup: 'cell_group',
      notes: 'notes',
    };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        if (values.length < 2) throw new Error('Insufficient data');

        // Build a keyed object using headers
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          const canonical = headerAliases[header] || header;
          row[canonical] = values[idx]?.trim() || '';
        });

        const memberData: any = {
          first_name: row['first_name'],
          last_name: row['last_name'],
          email: row['email'] || undefined,
          phone_primary: row['phone'] || undefined,
          gender: row['gender']?.toLowerCase() || undefined,
          date_of_birth: row['date_of_birth'] || undefined,
          address: row['address'] || undefined,
          city: row['city'] || undefined,
          join_date: row['join_date'] || new Date().toISOString().split('T')[0],
          church_id: churchId,
          branch_id: branchId || null,
          membership_status: 'active',
          is_new_convert: false,
          is_visitor: false,
        };

        if (!memberData.first_name || !memberData.last_name) {
          throw new Error('First name and last name are required');
        }

        // Only validate email format if one is provided
        if (memberData.email && !this.isValidEmail(memberData.email)) {
          throw new Error(`Invalid email format: ${memberData.email}`);
        }

        const { error } = await this.supabase.client
          .from('members')
          .insert(memberData);
        if (error) throw error;
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: error.message,
          data: lines[i],
        });
      }
    }
    return results;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  searchMembers(query: string, limit: number = 10): Observable<Member[]> {
    const churchId = this.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    let q = this.supabase.client
      .from('members')
      .select(
        'id, first_name, middle_name, last_name, member_number, photo_url',
      )
      .eq('church_id', churchId)
      .eq('membership_status', 'active')
      .or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_number.ilike.%${query}%`,
      );

    if (isBranchPastor && branchId) {
      q = q.eq('branch_id', branchId);
    }

    return from(q.limit(limit)).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as Member[];
      }),
    );
  }

  searchMembersPublic(
    churchId: string,
    query: string,
    limit = 10,
  ): Observable<Member[]> {
    if (!query || query.length < 2) return of([]);
    return from(
      this.supabase.client
        .from('members')
        .select(
          'id, first_name, middle_name, last_name, member_number, photo_url, church_id',
        )
        .eq('church_id', churchId)
        .eq('membership_status', 'active')
        .or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_number.ilike.%${query}%`,
        )
        .order('first_name', { ascending: true })
        .limit(limit),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as Member[];
      }),
      catchError(() => of([])),
    );
  }

  getMemberByIdPublic(memberId: string): Observable<Member | null> {
    return from(
      this.supabase.client
        .from('members')
        .select(
          'id, first_name, middle_name, last_name, member_number, photo_url, church_id',
        )
        .eq('id', memberId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) return null;
        return data as Member;
      }),
      catchError(() => of(null)),
    );
  }

  getMembersByBirthdayRange(
    startDate: string,
    endDate: string,
  ): Observable<Member[]> {
    const churchId = this.getChurchId();
    return from(
      this.supabase.client
        .from('members')
        .select('*')
        .eq('church_id', churchId)
        .eq('membership_status', 'active')
        .not('date_of_birth', 'is', null)
        .order('date_of_birth', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        const start = new Date(startDate);
        const end = new Date(endDate);
        const currentYear = new Date().getFullYear();
        return (data || []).filter((member: any) => {
          if (!member.date_of_birth) return false;
          const d = new Date(member.date_of_birth);
          const thisYear = new Date(currentYear, d.getMonth(), d.getDate());
          return thisYear >= start && thisYear <= end;
        }) as Member[];
      }),
      catchError(() => of([])),
    );
  }
}
