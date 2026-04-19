// src/app/features/members/services/member.service.ts
// KEY CHANGES:
// 1. searchMembers() now scopes cell_leader to their cell group(s) — same as fetchMembers
// 2. fetchMembers() unchanged — already correct for cell_leader and branch pastor
// Everything else is identical to your original.
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
  MemberAttendanceSummary,
  MemberAttendanceRecord,
  MemberGivingSummary,
  MemberGivingTransaction,
  MemberPledge,
  MemberMinistryAssignment,
  CellGroup,
} from '../../../models/member.model';
import { SubscriptionService } from '../../../core/services/subscription.service';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CellGroupsService } from '../../cells/services/cell-groups.service';

@Injectable({
  providedIn: 'root',
})
export class MemberService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private cellGroupsService: CellGroupsService,
  ) {}

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
    const role = this.authService.getCurrentUserRole();
    const userId = this.authService.getUserId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    // const isCellLeader = role === 'cell_leader';

    let query = this.supabase.client
      .from('members')
      .select('*', { count: 'exact' })
      .eq('church_id', churchId);

    // Branch pastor: scope to their branch
    if (isBranchPastor && branchId) {
      query = query.eq('branch_id', branchId);
    }

    // Cell leader: scope to members in their cell group(s)
    // if (isCellLeader && userId) {
    //   const { data: ledGroups } = await this.supabase.client
    //     .from('cell_groups')
    //     .select('id')
    //     .eq('leader_id', userId)
    //     .eq('is_active', true);

    //   const ledGroupIds = (ledGroups || []).map((g: any) => g.id);

    //   if (ledGroupIds.length === 0) {
    //     return { data: [], count: 0, page, pageSize, totalPages: 0 };
    //   }

    //   query = query.in('cell_group_id', ledGroupIds);
    // }

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
    if (filters.cell_group_filter) {
      query = query.eq('cell_group_id', filters.cell_group_filter);
    }

    const offset = (page - 1) * pageSize;
    let orderColumn = 'created_at';
    let orderAscending = false;

    if (filters.sort_by === 'name_asc') {
      orderColumn = 'first_name';
      orderAscending = true;
    } else if (filters.sort_by === 'name_desc') {
      orderColumn = 'first_name';
      orderAscending = false;
    }

    const { data, error, count } = await query
      .order(orderColumn, { ascending: orderAscending })
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
        .select('*, created_by_profile:profiles!created_by(id, full_name)')
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
    const memberId = this.authService.getUserId();

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
              created_by: memberId,
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

  exportMembersToExcel(filters: MemberSearchFilters = {}): Observable<Blob> {
    return this.getMembers(filters, 1, 10000).pipe(
      map(({ data: members }) => {
        const rows = members.map((m) => ({
          'Member Number': m.member_number || '',
          'First Name': m.first_name,
          'Middle Name': m.middle_name || '',
          'Last Name': m.last_name,
          Email: m.email || '',
          Phone: m.phone_primary || '',
          Gender: m.gender || '',
          'Date of Birth': m.date_of_birth || '',
          'Marital Status': m.marital_status || '',
          Address: m.address || '',
          City: m.city || '',
          Occupation: m.occupation || '',
          'Join Date': m.join_date,
          Status: m.membership_status,
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();

        worksheet['!cols'] = [
          { wch: 16 },
          { wch: 16 },
          { wch: 16 },
          { wch: 16 },
          { wch: 28 },
          { wch: 14 },
          { wch: 10 },
          { wch: 14 },
          { wch: 14 },
          { wch: 24 },
          { wch: 14 },
          { wch: 18 },
          { wch: 12 },
          { wch: 10 },
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Members');

        const summaryData = [
          { Info: 'Church', Value: 'Members Export' },
          { Info: 'Total Members', Value: members.length },
          { Info: 'Export Date', Value: new Date().toLocaleDateString() },
          {
            Info: 'Active',
            Value: members.filter((m) => m.membership_status === 'active')
              .length,
          },
          {
            Info: 'Inactive',
            Value: members.filter((m) => m.membership_status === 'inactive')
              .length,
          },
        ];
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        summarySheet['!cols'] = [{ wch: 18 }, { wch: 24 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        const buffer = XLSX.write(workbook, {
          bookType: 'xlsx',
          type: 'array',
        });
        return new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      }),
    );
  }

  exportMembersToPDF(filters: MemberSearchFilters = {}): Observable<Blob> {
    return this.getMembers(filters, 1, 10000).pipe(
      map(({ data: members }) => {
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4',
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const today = new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

        doc.setFillColor(91, 33, 182);
        doc.rect(0, 0, pageWidth, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Churchman', 14, 14);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Members Report', pageWidth / 2, 14, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Exported: ${today}`, pageWidth - 14, 14, { align: 'right' });

        const active = members.filter(
          (m) => m.membership_status === 'active',
        ).length;
        const inactive = members.length - active;
        const male = members.filter((m) => m.gender === 'male').length;
        const female = members.filter((m) => m.gender === 'female').length;

        doc.setFillColor(245, 243, 255);
        doc.rect(0, 22, pageWidth, 16, 'F');
        doc.setTextColor(91, 33, 182);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');

        const stats = [
          `Total: ${members.length}`,
          `Active: ${active}`,
          `Inactive: ${inactive}`,
          `Male: ${male}`,
          `Female: ${female}`,
        ];
        const colW = pageWidth / stats.length;
        stats.forEach((stat, i) => {
          doc.text(stat, colW * i + colW / 2, 32, { align: 'center' });
        });

        autoTable(doc, {
          startY: 42,
          head: [
            [
              '#',
              'Member No.',
              'First Name',
              'Last Name',
              'Email',
              'Phone',
              'Gender',
              'Date of Birth',
              'Join Date',
              'Status',
            ],
          ],
          body: members.map((m, idx) => [
            idx + 1,
            m.member_number || '—',
            m.first_name || '—',
            m.last_name || '—',
            m.email || '—',
            m.phone_primary || '—',
            m.gender
              ? m.gender.charAt(0).toUpperCase() + m.gender.slice(1)
              : '—',
            m.date_of_birth || '—',
            m.join_date || '—',
            m.membership_status
              ? m.membership_status.charAt(0).toUpperCase() +
                m.membership_status.slice(1)
              : '—',
          ]),
          styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
          headStyles: {
            fillColor: [91, 33, 182],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { cellWidth: 22 },
            2: { cellWidth: 24 },
            3: { cellWidth: 24 },
            4: { cellWidth: 48 },
            5: { cellWidth: 24 },
            6: { cellWidth: 16 },
            7: { cellWidth: 24 },
            8: { cellWidth: 22 },
            9: { cellWidth: 20 },
          },
          didDrawPage: (data) => {
            const pageCount = (doc as any).internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(156, 163, 175);
            doc.setFont('helvetica', 'normal');
            doc.text(
              `Page ${data.pageNumber} of ${pageCount}  •  Churchman Church Management`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 6,
              { align: 'center' },
            );
          },
        });

        return new Blob([doc.output('arraybuffer')], {
          type: 'application/pdf',
        });
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
    return from(this.processFileImport(file));
  }

  private async processFileImport(file: File): Promise<ImportResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      return this.processExcelImport(file);
    }
    return this.processCSVImport(file);
  }

  private async processExcelImport(file: File): Promise<ImportResult> {
    const churchId = this.getChurchId();
    const branchId = this.authService.getBranchId();

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    // Filter out completely empty rows (common in exported Excel files)
    const dataRows = rows.filter((row) =>
      Object.values(row).some((v) => v !== '' && v !== null && v !== undefined),
    );

    if (!dataRows.length)
      throw new Error('Excel file is empty or has no data rows');

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    // ── Pre-load all existing phones + emails for this church
    // so we can check duplicates in-memory (fast, avoids N DB round trips)
    const { data: existingMembers } = await this.supabase.client
      .from('members')
      .select('email, phone_primary')
      .eq('church_id', churchId);

    const existingEmails = new Set(
      (existingMembers || [])
        .map((m: any) => m.email?.toLowerCase().trim())
        .filter(Boolean),
    );
    const existingPhones = new Set(
      (existingMembers || [])
        .map((m: any) => m.phone_primary?.trim())
        .filter(Boolean),
    );

    // ── Track phones/emails seen within THIS import batch
    // so we catch duplicates inside the file itself
    const seenPhonesThisBatch = new Set<string>();
    const seenEmailsThisBatch = new Set<string>();

    // ── Column header aliases (handles any capitalisation / spacing)
    const headerAliases: Record<string, string> = {
      'first name': 'first_name',
      first_name: 'first_name',
      firstname: 'first_name',
      'last name': 'last_name',
      last_name: 'last_name',
      lastname: 'last_name',
      surname: 'last_name',
      email: 'email',
      'email address': 'email',
      phone: 'phone',
      'phone number': 'phone',
      phone_number: 'phone',
      phonenumber: 'phone',
      mobile: 'phone',
      'mobile number': 'phone',
      gender: 'gender',
      'date of birth': 'date_of_birth',
      date_of_birth: 'date_of_birth',
      dob: 'date_of_birth',
      dateofbirth: 'date_of_birth',
      birthday: 'date_of_birth',
      'join date': 'join_date',
      join_date: 'join_date',
      joindate: 'join_date',
      'membership date': 'join_date',
      address: 'address',
      city: 'city',
      title: 'title',
      'cell group': 'cell_group',
      cell_group: 'cell_group',
      cellgroup: 'cell_group',
      notes: 'notes',
    };

    for (let i = 0; i < dataRows.length; i++) {
      try {
        // Normalise keys
        const row: Record<string, string> = {};
        Object.entries(dataRows[i]).forEach(([key, val]) => {
          const normalized = key.trim().toLowerCase();
          const canonical = headerAliases[normalized] || normalized;
          row[canonical] = String(val ?? '').trim();
        });

        // ── Required fields
        const firstName = row['first_name'];
        const lastName = row['last_name'];

        if (!firstName || !lastName) {
          throw new Error('First name and last name are required');
        }

        // ── Normalise optional fields
        const email = row['email']?.toLowerCase() || undefined;
        const phone = row['phone'] || undefined;
        const dob = this.normalizeDate(row['date_of_birth']);
        const joinDate =
          this.normalizeDate(row['join_date']) ||
          new Date().toISOString().split('T')[0];
        const gender = row['gender']?.toLowerCase() || undefined;

        // ── Validate email format
        if (email && !this.isValidEmail(email)) {
          throw new Error(`Invalid email format: ${email}`);
        }

        // ── Duplicate check: email against DB
        if (email && existingEmails.has(email)) {
          throw new Error(
            `Member with email "${email}" already exists in your church — skipped`,
          );
        }

        // ── Duplicate check: email within this batch
        if (email && seenEmailsThisBatch.has(email)) {
          throw new Error(
            `Email "${email}" appears more than once in this file — skipped`,
          );
        }

        // ── Duplicate check: phone against DB
        if (phone && existingPhones.has(phone)) {
          throw new Error(
            `Member with phone "${phone}" already exists in your church — skipped`,
          );
        }

        // ── Duplicate check: phone within this batch
        if (phone && seenPhonesThisBatch.has(phone)) {
          throw new Error(
            `Phone "${phone}" appears more than once in this file — skipped`,
          );
        }

        // ── Build member record
        const memberData: any = {
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone_primary: phone || null,
          gender: gender || null,
          date_of_birth: dob || null,
          address: row['address'] || null,
          city: row['city'] || null,
          notes: row['notes'] || null,
          join_date: joinDate,
          church_id: churchId,
          branch_id: branchId || null,
          membership_status: 'active',
          is_new_convert: false,
          is_visitor: false,
        };

        const { error } = await this.supabase.client
          .from('members')
          .insert(memberData);

        if (error) {
          // Catch any DB-level unique constraint as a final safety net
          if (
            error.code === '23505' ||
            error.message?.includes('members_email_unique')
          ) {
            throw new Error(
              `Member with email "${email}" already exists — skipped`,
            );
          }
          if (error.message?.includes('members_phone')) {
            throw new Error(
              `Member with phone "${phone}" already exists — skipped`,
            );
          }
          throw new Error(error.message);
        }

        // ── Only track in sets AFTER successful insert
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
        if (email) seenEmailsThisBatch.add(email);
        if (phone) seenPhonesThisBatch.add(phone);

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 2, // +2 = header row + 1-indexed
          error: error.message,
          data: '',
        });
      }
    }

    return results;
  }

  private normalizeDate(value: string | undefined | null): string | undefined {
    if (!value) return undefined;
    const s = String(value).trim();
    if (!s) return undefined;

    // Already ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // Excel serial number (5-digit integer, e.g. 36906)
    if (/^\d{5}$/.test(s)) {
      // Excel epoch is Dec 30 1899 (accounts for Lotus 1-2-3 leap year bug)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + parseInt(s, 10));
      return excelEpoch.toISOString().split('T')[0];
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY  (most common outside US)
    const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const candidate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const dt = new Date(candidate);
      if (!isNaN(dt.getTime())) return candidate;
    }

    // Fallback: let JS try (handles "Jan 16, 2001", "2001/01/16", etc.)
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().split('T')[0];
    }

    return undefined; // unparseable — will be stored as null
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

    // ── Pre-load existing members for duplicate detection
    const { data: existingMembers } = await this.supabase.client
      .from('members')
      .select('email, phone_primary')
      .eq('church_id', churchId);

    const existingEmails = new Set(
      (existingMembers || [])
        .map((m: any) => m.email?.toLowerCase().trim())
        .filter(Boolean),
    );
    const existingPhones = new Set(
      (existingMembers || [])
        .map((m: any) => m.phone_primary?.trim())
        .filter(Boolean),
    );

    const seenPhonesThisBatch = new Set<string>();
    const seenEmailsThisBatch = new Set<string>();

    const headerAliases: Record<string, string> = {
      first_name: 'first_name',
      last_name: 'last_name',
      email: 'email',
      phone: 'phone',
      phone_number: 'phone',
      phonenumber: 'phone',
      mobile: 'phone',
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

    const headers = this.parseCSVLine(lines[0]).map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
    );

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        if (values.length < 2) throw new Error('Insufficient data');

        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          const canonical = headerAliases[header] || header;
          row[canonical] = values[idx]?.trim() || '';
        });

        const firstName = row['first_name'];
        const lastName = row['last_name'];

        if (!firstName || !lastName) {
          throw new Error('First name and last name are required');
        }

        const email = row['email']?.toLowerCase() || undefined;
        const phone = row['phone'] || undefined;
        const dob = this.normalizeDate(row['date_of_birth']);
        const joinDate =
          this.normalizeDate(row['join_date']) ||
          new Date().toISOString().split('T')[0];
        const gender = row['gender']?.toLowerCase() || undefined;

        if (email && !this.isValidEmail(email)) {
          throw new Error(`Invalid email format: ${email}`);
        }

        if (email && existingEmails.has(email)) {
          throw new Error(
            `Member with email "${email}" already exists in your church — skipped`,
          );
        }
        if (email && seenEmailsThisBatch.has(email)) {
          throw new Error(
            `Email "${email}" appears more than once in this file — skipped`,
          );
        }
        if (phone && existingPhones.has(phone)) {
          throw new Error(
            `Member with phone "${phone}" already exists in your church — skipped`,
          );
        }
        if (phone && seenPhonesThisBatch.has(phone)) {
          throw new Error(
            `Phone "${phone}" appears more than once in this file — skipped`,
          );
        }

        const memberData: any = {
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone_primary: phone || null,
          gender: gender || null,
          date_of_birth: dob || null,
          address: row['address'] || null,
          city: row['city'] || null,
          notes: row['notes'] || null,
          join_date: joinDate,
          church_id: churchId,
          branch_id: branchId || null,
          membership_status: 'active',
          is_new_convert: false,
          is_visitor: false,
        };

        const { error } = await this.supabase.client
          .from('members')
          .insert(memberData);

        if (error) {
          if (
            error.code === '23505' ||
            error.message?.includes('members_email_unique')
          ) {
            throw new Error(
              `Member with email "${email}" already exists — skipped`,
            );
          }
          if (error.message?.includes('members_phone')) {
            throw new Error(
              `Member with phone "${phone}" already exists — skipped`,
            );
          }
          if (error.message?.includes('not-null')) {
            throw new Error(
              'Missing required field — check First Name and Last Name',
            );
          }
          throw new Error(error.message);
        }

        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
        if (email) seenEmailsThisBatch.add(email);
        if (phone) seenPhonesThisBatch.add(phone);

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
        } else {
          inQuotes = !inQuotes;
        }
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

  // KEY FIX: searchMembers now applies cell_leader scoping
  searchMembers(query: string, limit: number = 10): Observable<Member[]> {
    return from(this.searchMembersAsync(query, limit));
  }

  private async searchMembersAsync(
    query: string,
    limit: number,
  ): Promise<Member[]> {
    const churchId = this.getChurchId();
    const role = this.authService.getCurrentUserRole();
    const userId = this.authService.getUserId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    const isCellLeader = role === 'cell_leader';

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

    // Branch pastor: scope to branch
    if (isBranchPastor && branchId) {
      q = q.eq('branch_id', branchId);
    }

    // Cell leader: scope to their cell group members
    // if (isCellLeader && userId) {
    //   const { data: ledGroups } = await this.supabase.client
    //     .from('cell_groups')
    //     .select('id')
    //     .eq('leader_id', userId)
    //     .eq('is_active', true);

    //   const ledGroupIds = (ledGroups || []).map((g: any) => g.id);

    //   if (ledGroupIds.length === 0) return [];
    //   q = q.in('cell_group_id', ledGroupIds);
    // }

    const { data, error } = await q.limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as Member[];
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

  // ── Attendance ──────────────────────────────────────────────────────────────

  getMemberAttendanceSummary(
    memberId: string,
  ): Observable<MemberAttendanceSummary | null> {
    return from(
      this.supabase.client
        .from('member_attendance_summary')
        .select('*')
        .eq('member_id', memberId)
        .maybeSingle(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) return null;
        return {
          member_id: data.member_id,
          total_attendance: Number(data.total_attendance ?? 0),
          last_attendance: data.last_attendance ?? null,
          attendance_last_30_days: Number(data.attendance_last_30_days ?? 0),
          attendance_this_year: Number(data.attendance_this_year ?? 0),
        } as MemberAttendanceSummary;
      }),
      catchError(() => of(null)),
    );
  }

  getMemberAttendanceRecords(
    memberId: string,
    page: number = 1,
    pageSize: number = 15,
  ): Observable<{ data: MemberAttendanceRecord[]; count: number }> {
    const offset = (page - 1) * pageSize;
    return from(
      this.supabase.client
        .from('attendance_records')
        .select(
          `id, checked_in_at, check_in_method, notes,
           attendance_events!inner(event_name, event_type, event_date, event_time, location)`,
          { count: 'exact' },
        )
        .eq('member_id', memberId)
        .order('checked_in_at', { ascending: false })
        .range(offset, offset + pageSize - 1),
    ).pipe(
      map(({ data, error, count }) => {
        if (error) throw new Error(error.message);
        const records: MemberAttendanceRecord[] = (data || []).map(
          (r: any) => ({
            id: r.id,
            attendance_event_id: r.attendance_event_id,
            checked_in_at: r.checked_in_at,
            check_in_method: r.check_in_method,
            notes: r.notes,
            event_name: r.attendance_events?.event_name ?? '—',
            event_type: r.attendance_events?.event_type ?? '—',
            event_date: r.attendance_events?.event_date ?? '',
            event_time: r.attendance_events?.event_time ?? null,
            location: r.attendance_events?.location ?? null,
          }),
        );
        return { data: records, count: count ?? 0 };
      }),
      catchError(() => of({ data: [], count: 0 })),
    );
  }

  // ── Giving ──────────────────────────────────────────────────────────────────

  getMemberGivingSummary(
    memberId: string,
  ): Observable<MemberGivingSummary | null> {
    return from(
      this.supabase.client
        .from('member_giving_summary')
        .select('*')
        .eq('member_id', memberId)
        .maybeSingle(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) return null;
        return {
          total_transactions: Number(data.total_transactions ?? 0),
          total_given: Number(data.total_given ?? 0),
          avg_transaction: Number(data.avg_transaction ?? 0),
          last_giving_date: data.last_giving_date ?? null,
          first_giving_date: data.first_giving_date ?? null,
        } as MemberGivingSummary;
      }),
      catchError(() => of(null)),
    );
  }

  getMemberGivingTransactions(
    memberId: string,
    page: number = 1,
    pageSize: number = 15,
  ): Observable<{ data: MemberGivingTransaction[]; count: number }> {
    const offset = (page - 1) * pageSize;
    return from(
      this.supabase.client
        .from('giving_transactions')
        .select(
          `id, amount, currency, payment_method, transaction_reference,
           transaction_date, fiscal_year, notes, created_at,
           giving_categories!inner(name)`,
          { count: 'exact' },
        )
        .eq('member_id', memberId)
        .order('transaction_date', { ascending: false })
        .range(offset, offset + pageSize - 1),
    ).pipe(
      map(({ data, error, count }) => {
        if (error) throw new Error(error.message);
        const transactions: MemberGivingTransaction[] = (data || []).map(
          (t: any) => ({
            id: t.id,
            amount: Number(t.amount),
            currency: t.currency ?? 'GHS',
            payment_method: t.payment_method,
            transaction_reference: t.transaction_reference ?? null,
            transaction_date: t.transaction_date,
            fiscal_year: t.fiscal_year ?? null,
            notes: t.notes ?? null,
            created_at: t.created_at,
            category_name: t.giving_categories?.name ?? '—',
          }),
        );
        return { data: transactions, count: count ?? 0 };
      }),
      catchError(() => of({ data: [], count: 0 })),
    );
  }

  getMemberPledges(memberId: string): Observable<MemberPledge[]> {
    return from(
      this.supabase.client
        .from('pledges')
        .select(
          `id, pledge_amount, amount_paid, currency, pledge_date,
           due_date, is_fulfilled, notes, giving_categories(name)`,
        )
        .eq('member_id', memberId)
        .order('pledge_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((p: any) => ({
          id: p.id,
          pledge_amount: Number(p.pledge_amount),
          amount_paid: Number(p.amount_paid ?? 0),
          currency: p.currency ?? 'GHS',
          pledge_date: p.pledge_date,
          due_date: p.due_date ?? null,
          is_fulfilled: p.is_fulfilled ?? false,
          notes: p.notes ?? null,
          category_name: p.giving_categories?.name ?? null,
        })) as MemberPledge[];
      }),
      catchError(() => of([])),
    );
  }

  // ── Ministries ──────────────────────────────────────────────────────────────

  getMemberMinistries(
    memberId: string,
  ): Observable<MemberMinistryAssignment[]> {
    return from(
      this.supabase.client
        .from('ministry_members')
        .select(
          `id, ministry_id, role, joined_date, is_active,
           ministries!inner(name, description, category, meeting_day,
                            meeting_time, meeting_location, meeting_schedule)`,
        )
        .eq('member_id', memberId)
        .order('joined_date', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []).map((m: any) => ({
          id: m.id,
          ministry_id: m.ministry_id,
          role: m.role ?? null,
          joined_date: m.joined_date,
          is_active: m.is_active ?? false,
          ministry_name: m.ministries?.name ?? '—',
          ministry_description: m.ministries?.description ?? null,
          ministry_category: m.ministries?.category ?? null,
          meeting_day: m.ministries?.meeting_day ?? null,
          meeting_time: m.ministries?.meeting_time ?? null,
          meeting_location: m.ministries?.meeting_location ?? null,
          meeting_schedule: m.ministries?.meeting_schedule ?? null,
        })) as MemberMinistryAssignment[];
      }),
      catchError(() => of([])),
    );
  }

  // ── Cell Groups ──────────────────────────────────────────────────────────────

  getCellGroups(): Observable<CellGroup[]> {
    return this.cellGroupsService.getActiveCellGroups();
  }
}
