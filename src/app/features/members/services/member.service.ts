// src/app/features/members/services/member.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  private churchId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {
    this.churchId = this.authService.getChurchId();
  }

  // Get all members with filters and pagination
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
    let query = this.supabase.client
      .from('members')
      .select('*', { count: 'exact' })
      .eq('church_id', this.churchId);

    // Apply filters
    if (filters.search_term) {
      query = query.or(
        `first_name.ilike.%${filters.search_term}%,last_name.ilike.%${filters.search_term}%,email.ilike.%${filters.search_term}%,phone_primary.ilike.%${filters.search_term}%,member_number.ilike.%${filters.search_term}%`,
      );
    }

    if (filters.gender_filter) {
      query = query.eq('gender', filters.gender_filter);
    }

    if (filters.status_filter) {
      query = query.eq('membership_status', filters.status_filter);
    }

    if (filters.branch_filter) {
      query = query.eq('branch_id', filters.branch_filter);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return {
      data: (data || []) as Member[],
      count: count || 0,
      page,
      pageSize,
      totalPages,
    };
  }

  // Get single member by ID
  getMemberById(id: string): Observable<Member> {
    return from(
      this.supabase.client
        .from('members')
        .select('*')
        .eq('id', id)
        .eq('church_id', this.churchId)
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

  // Create new member
  createMember(memberData: MemberCreateInput): Observable<Member> {
    const data = {
      ...memberData,
      church_id: this.churchId,
      membership_status: 'active' as const,
      is_new_convert: memberData.is_new_convert || false,
      is_visitor: memberData.is_visitor || false,
    };

    return from(
      this.supabase.client.from('members').insert(data).select().single(),
    ).pipe(
      map(({ data: member, error }) => {
        if (error) throw new Error(error.message);
        if (!member) throw new Error('Failed to create member');
        return member as Member;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // Update existing member
  updateMember(id: string, memberData: MemberUpdateInput): Observable<Member> {
    const data = {
      ...memberData,
      updated_at: new Date().toISOString(),
    };

    return from(
      this.supabase.client
        .from('members')
        .update(data)
        .eq('id', id)
        .eq('church_id', this.churchId)
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

  // Delete (soft delete - set to inactive)
  deleteMember(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('members')
        .update({
          membership_status: 'inactive' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('church_id', this.churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // Upload member photo
  uploadMemberPhoto(memberId: string, file: File): Observable<string> {
    return from(this.uploadPhoto(memberId, file));
  }

  private async uploadPhoto(memberId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${memberId}_${Date.now()}.${fileExt}`;
    const filePath = `members/${this.churchId}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('member-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = this.supabase.client.storage
      .from('member-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  // Get member statistics - FIXED
  getMemberStatistics(): Observable<MemberStatistics> {
    return from(
      this.supabase.client.rpc('get_membership_stats', {
        church_uuid: this.churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error fetching statistics:', error);
          throw new Error(error.message);
        }

        // Parse the JSON response
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
      catchError((err) => {
        console.error('Error fetching statistics:', err);
        return of({
          total_members: 0,
          active_members: 0,
          inactive_members: 0,
          new_members_this_month: 0,
          new_members_this_year: 0,
          male_members: 0,
          female_members: 0,
        } as MemberStatistics);
      }),
    );
  }

  // Export members to CSV - FIXED
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

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
    );
  }

  // Helper to escape CSV values
  private escapeCsvValue(value: string | undefined | null): string {
    if (!value) return '';

    const stringValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  // Import members from CSV - FIXED
  importMembersFromCSV(file: File): Observable<ImportResult> {
    return from(this.processCSVImport(file));
  }

  private async processCSVImport(file: File): Promise<ImportResult> {
    const text = await file.text();
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = this.parseCSVLine(lines[0]);
    const results: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);

        if (values.length < 2) {
          throw new Error(
            'Insufficient data - at least first and last name required',
          );
        }

        const memberData: MemberCreateInput = {
          first_name: values[0]?.trim(),
          last_name: values[1]?.trim(),
          email: values[2]?.trim() || undefined,
          phone_primary: values[3]?.trim() || undefined,
          gender: (values[4]?.trim().toLowerCase() as any) || undefined,
          date_of_birth: values[5]?.trim() || undefined,
          address: values[6]?.trim() || undefined,
          city: values[7]?.trim() || undefined,
          join_date:
            values[8]?.trim() || new Date().toISOString().split('T')[0],
          is_new_convert: false,
          is_visitor: false,
        };

        // Validate required fields
        if (!memberData.first_name || !memberData.last_name) {
          throw new Error('First name and last name are required');
        }

        // Validate email format if provided
        if (memberData.email && !this.isValidEmail(memberData.email)) {
          throw new Error('Invalid email format');
        }

        // Validate phone format if provided
        if (
          memberData.phone_primary &&
          !this.isValidPhone(memberData.phone_primary)
        ) {
          throw new Error('Invalid phone format (should be 10 digits)');
        }

        // Validate date format if provided
        if (
          memberData.date_of_birth &&
          !this.isValidDate(memberData.date_of_birth)
        ) {
          throw new Error('Invalid date format (should be YYYY-MM-DD)');
        }

        const insertData = {
          ...memberData,
          church_id: this.churchId,
          membership_status: 'active' as const,
        };

        const { error } = await this.supabase.client
          .from('members')
          .insert(insertData);

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

  // Parse CSV line handling quoted values
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last value
    values.push(current);

    return values;
  }

  // Validation helpers
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    return /^0[0-9]{9}$/.test(phone);
  }

  private isValidDate(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
  }

  // Search members
  searchMembers(query: string, limit: number = 10): Observable<Member[]> {
    return from(
      this.supabase.client
        .from('members')
        .select(
          'id, first_name, middle_name, last_name, member_number, photo_url',
        )
        .eq('church_id', this.churchId)
        .eq('membership_status', 'active')
        .or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_number.ilike.%${query}%`,
        )
        .limit(limit),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as Member[];
      }),
    );
  }

  // Public search for QR check-in (NO AUTH REQUIRED)
  searchMembersPublic(
    churchId: string,
    query: string,
    limit: number = 10,
  ): Observable<Member[]> {
    if (!query || query.length < 2) {
      return of([]);
    }

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
      catchError((err) => {
        console.error('Public member search error:', err);
        return of([]);
      }),
    );
  }

  // Get member by ID (public - for QR check-in)
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
        if (error) {
          console.error('Error fetching member:', error);
          return null;
        }
        return data as Member;
      }),
      catchError((err) => {
        console.error('Public member fetch error:', err);
        return of(null);
      }),
    );
  }

  getMembersByBirthdayRange(
    startDate: string,
    endDate: string,
  ): Observable<Member[]> {
    return from(
      this.supabase.client
        .from('members')
        .select('*')
        .eq('church_id', this.churchId)
        .eq('membership_status', 'active')
        .not('date_of_birth', 'is', null)
        .order('date_of_birth', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);

        // Filter by upcoming birthdays in JavaScript
        const start = new Date(startDate);
        const end = new Date(endDate);
        const currentYear = new Date().getFullYear();

        return (data || []).filter((member: any) => {
          if (!member.date_of_birth) return false;

          const birthDate = new Date(member.date_of_birth);
          const thisYearBirthday = new Date(
            currentYear,
            birthDate.getMonth(),
            birthDate.getDate(),
          );

          return thisYearBirthday >= start && thisYearBirthday <= end;
        }) as Member[];
      }),
      catchError((err) => {
        console.error('Error fetching birthday members:', err);
        return of([]);
      }),
    );
  }
}
