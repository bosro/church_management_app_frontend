// src/app/features/attendance/services/attendance.service.ts
// Replace the entire file with this:

import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  AttendanceEvent,
  AttendanceEventType,
  AttendanceRecord,
  AttendanceStatus,
  Visitor,
  AttendanceStatistics,
  AttendanceReportData,
  BulkCheckInResult,
  VisitorCheckInData,
  CheckInMethod,
} from '../../../models/attendance.model';
import { UserRolesService } from '../../user-roles/services/user-roles';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private userRolesService: UserRolesService,
  ) {}

  // ==================== PERMISSIONS ====================

  canManageAttendance(): boolean {
    return (
      this.authService.hasRole(['super_admin', 'church_admin']) ||
      this.userRolesService.hasPermission('attendance.manage')
    );
  }

  canViewAttendance(): boolean {
    return (
      this.authService.hasRole(['super_admin', 'church_admin']) ||
      this.userRolesService.hasPermission('attendance.view')
    );
  }

  canMarkAttendance(): boolean {
    return (
      this.authService.hasRole(['super_admin', 'church_admin']) ||
      this.userRolesService.hasPermission('attendance.checkin')
    );
  }

  // ==================== ATTENDANCE EVENTS ====================

  getAttendanceEvents(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      eventType?: AttendanceEventType;
      startDate?: string;
      endDate?: string;
    },
  ): Observable<{ data: AttendanceEvent[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_events')
          .select('*, created_by_profile:profiles!created_by(id, full_name)', {
            count: 'exact',
          })
          .eq('church_id', churchId);

        if (isBranchPastor && branchId) {
          query = query.eq('branch_id', branchId);
        }
        if (filters?.eventType)
          query = query.eq('event_type', filters.eventType);
        if (filters?.startDate)
          query = query.gte('event_date', filters.startDate);
        if (filters?.endDate) query = query.lte('event_date', filters.endDate);

        const { data, error, count } = await query
          .order('event_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as AttendanceEvent[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getAttendanceEventById(eventId: string): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('attendance_events')
        .select('*, created_by_profile:profiles!created_by(id, full_name)')
        .eq('id', eventId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Event not found');
        return data as AttendanceEvent;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Create event — updated to support recurrence ───────────────
  createAttendanceEvent(eventData: {
    event_type: AttendanceEventType;
    event_name: string;
    event_date: string;
    event_time?: string;
    location?: string;
    expected_attendance?: number;
    notes?: string;
    is_recurring?: boolean;
    recurrence_frequency?: string;
    recurrence_day_of_week?: number;
  }): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();
    const branchId = this.authService.getBranchId();
    const groupId = eventData.is_recurring ? crypto.randomUUID() : null;

    return from(
      this.supabase.insert<AttendanceEvent>('attendance_events', {
        church_id: churchId,
        branch_id: branchId || null,
        event_type: eventData.event_type,
        event_name: eventData.event_name.trim(),
        event_date: eventData.event_date,
        event_time: eventData.event_time || null,
        location: eventData.location?.trim() || null,
        expected_attendance: eventData.expected_attendance || null,
        notes: eventData.notes?.trim() || null,
        total_attendance: 0,
        total_absent: 0,
        is_recurring: eventData.is_recurring ?? false,
        recurrence_frequency: eventData.is_recurring
          ? eventData.recurrence_frequency || null
          : null,
        recurrence_day_of_week: eventData.is_recurring
          ? (eventData.recurrence_day_of_week ?? null)
          : null,
        recurrence_group_id: groupId,
        created_by: userId,
      } as any),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to create event');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Spawn next occurrence of a recurring event ─────────────────
  spawnNextOccurrence(event: AttendanceEvent): Observable<AttendanceEvent> {
    if (!event.is_recurring || !event.recurrence_frequency) {
      return throwError(() => new Error('Not a recurring event'));
    }

    const nextDate = this.calculateNextOccurrence(
      event.event_date,
      event.recurrence_frequency as any,
      event.recurrence_day_of_week,
    );

    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<AttendanceEvent>('attendance_events', {
        church_id: churchId,
        branch_id: event.branch_id || null,
        event_type: event.event_type,
        event_name: event.event_name,
        event_date: nextDate,
        event_time: event.event_time || null,
        location: event.location || null,
        expected_attendance: event.expected_attendance || null,
        notes: event.notes || null,
        total_attendance: 0,
        total_absent: 0,
        is_recurring: true,
        recurrence_frequency: event.recurrence_frequency,
        recurrence_day_of_week: event.recurrence_day_of_week,
        recurrence_group_id: event.recurrence_group_id,
        parent_event_id: event.id,
        created_by: userId,
      } as any),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to spawn occurrence');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // Check if a next occurrence already exists for this recurring event
  hasNextOccurrence(event: AttendanceEvent): Observable<boolean> {
    if (!event.recurrence_group_id) return from(Promise.resolve(false));

    const nextDate = this.calculateNextOccurrence(
      event.event_date,
      event.recurrence_frequency as any,
      event.recurrence_day_of_week,
    );

    return from(
      this.supabase.client
        .from('attendance_events')
        .select('id', { count: 'exact', head: true })
        .eq('recurrence_group_id', event.recurrence_group_id)
        .eq('event_date', nextDate),
    ).pipe(
      map(({ count }) => (count ?? 0) > 0),
      catchError(() => from(Promise.resolve(false))),
    );
  }

  private calculateNextOccurrence(
    fromDate: string,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    dayOfWeek?: number,
  ): string {
    const date = new Date(fromDate);

    if (frequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (frequency === 'biweekly') {
      date.setDate(date.getDate() + 14);
    } else if (frequency === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    }

    return date.toISOString().split('T')[0];
  }

  updateAttendanceEvent(
    eventId: string,
    eventData: Partial<AttendanceEvent>,
  ): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Event not found or access denied');

        return this.supabase.update<AttendanceEvent>(
          'attendance_events',
          eventId,
          {
            ...eventData,
            updated_at: new Date().toISOString(),
          },
        );
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to update event');
        return data[0];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteAttendanceEvent(eventId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('attendance_events')
          .select('id, total_attendance')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) throw new Error('Event not found or access denied');

        return this.supabase.delete('attendance_events', eventId);
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== ATTENDANCE RECORDS ====================

  getAttendanceRecords(
    eventId: string,
    filters?: { memberType?: 'member' | 'visitor'; status?: AttendanceStatus },
  ): Observable<AttendanceRecord[]> {
    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_records')
          .select(
            `*,
  member:members(
    id, first_name, last_name, middle_name, photo_url, member_number,
    cell_group_id,
    cell_group:cell_groups(id, name)
  ),
  visitor:visitors(id, first_name, last_name),
  checked_in_by_profile:profiles!checked_in_by(id, full_name)`,
          )
          .eq('attendance_event_id', eventId);

        if (filters?.memberType === 'member') {
          query = query.not('member_id', 'is', null);
        } else if (filters?.memberType === 'visitor') {
          query = query.not('visitor_id', 'is', null);
        }

        if (filters?.status) {
          query = query.eq('status', filters.status);
        }

        const { data, error } = await query.order('checked_in_at', {
          ascending: false,
        });

        if (error) throw new Error(error.message);
        return data as AttendanceRecord[];
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  checkInMember(
    eventId: string,
    memberId: string,
    method: CheckInMethod = 'manual',
  ): Observable<AttendanceRecord> {
    const userId = this.authService.getUserId();
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) throw new Error('Event not found or access denied');

        // Check if record exists (could be absent record)
        const { data: existing } = await this.supabase.client
          .from('attendance_records')
          .select('id, status')
          .eq('attendance_event_id', eventId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'present') {
            throw new Error('Member already checked in for this event');
          }
          // Update absent record to present
          const { data, error } = await this.supabase.client
            .from('attendance_records')
            .update({
              status: 'present',
              absence_reason: null,
              checked_in_at: new Date().toISOString(),
              checked_in_by: userId,
              check_in_method: method,
            })
            .eq('id', existing.id)
            .select(
              `*,
              member:members(id, first_name, last_name, middle_name, photo_url, member_number),
              visitor:visitors(id, first_name, last_name)`,
            )
            .single();

          if (error) throw new Error(error.message);
          await this.updateEventAttendanceCount(eventId);
          return data as AttendanceRecord;
        }

        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) throw new Error('Member not found');

        const { data, error } = await this.supabase.insert<AttendanceRecord>(
          'attendance_records',
          {
            attendance_event_id: eventId,
            member_id: memberId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: method,
            status: 'present',
          } as any,
        );

        if (error) throw new Error(error.message);
        await this.updateEventAttendanceCount(eventId);
        return data![0];
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== MARK ABSENT ====================

  markMemberAbsent(
    eventId: string,
    memberId: string,
    reason?: string,
  ): Observable<AttendanceRecord> {
    const userId = this.authService.getUserId();
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) throw new Error('Event not found or access denied');

        // Check if record already exists
        const { data: existing } = await this.supabase.client
          .from('attendance_records')
          .select('id, status')
          .eq('attendance_event_id', eventId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'absent') {
            // Update reason only
            const { data, error } = await this.supabase.client
              .from('attendance_records')
              .update({
                absence_reason: reason || null,
                checked_in_by: userId,
              })
              .eq('id', existing.id)
              .select(
                `*,
                member:members(id, first_name, last_name, middle_name, photo_url, member_number),
                visitor:visitors(id, first_name, last_name)`,
              )
              .single();

            if (error) throw new Error(error.message);
            return data as AttendanceRecord;
          }

          // Was present, flip to absent
          const { data, error } = await this.supabase.client
            .from('attendance_records')
            .update({
              status: 'absent',
              absence_reason: reason || null,
              checked_in_by: userId,
            })
            .eq('id', existing.id)
            .select(
              `*,
              member:members(id, first_name, last_name, middle_name, photo_url, member_number),
              visitor:visitors(id, first_name, last_name)`,
            )
            .single();

          if (error) throw new Error(error.message);
          await this.updateEventAttendanceCount(eventId);
          return data as AttendanceRecord;
        }

        // No record yet — create absent record
        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) throw new Error('Member not found');

        const { data, error } = await this.supabase.client
          .from('attendance_records')
          .insert({
            attendance_event_id: eventId,
            member_id: memberId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: 'manual',
            status: 'absent',
            absence_reason: reason || null,
          })
          .select(
            `*,
            member:members(id, first_name, last_name, middle_name, photo_url, member_number),
            visitor:visitors(id, first_name, last_name)`,
          )
          .single();

        if (error) throw new Error(error.message);
        await this.updateEventAttendanceCount(eventId);
        return data as AttendanceRecord;
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  updateAbsenceReason(
    recordId: string,
    reason: string,
  ): Observable<AttendanceRecord> {
    return from(
      this.supabase.client
        .from('attendance_records')
        .update({ absence_reason: reason })
        .eq('id', recordId)
        .select(
          `*,
          member:members(id, first_name, last_name, middle_name, photo_url, member_number),
          visitor:visitors(id, first_name, last_name)`,
        )
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as AttendanceRecord;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  checkInVisitor(
    eventId: string,
    visitorData: VisitorCheckInData,
  ): Observable<AttendanceRecord> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    if (!visitorData.first_name || !visitorData.last_name) {
      return throwError(() => new Error('Visitor name is required'));
    }

    return from(
      (async () => {
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) throw new Error('Event not found or access denied');

        let visitor: Visitor | null = null;

        if (visitorData.phone || visitorData.email) {
          let visitorQuery = this.supabase.client
            .from('visitors')
            .select('*')
            .eq('church_id', churchId);

          if (visitorData.phone) {
            visitorQuery = visitorQuery.eq('phone', visitorData.phone);
          } else if (visitorData.email) {
            visitorQuery = visitorQuery.eq('email', visitorData.email);
          }

          const { data: existingVisitor } = await visitorQuery.maybeSingle();
          visitor = existingVisitor;
        }

        if (visitor) {
          await this.supabase.update('visitors', visitor.id, {
            last_visit_date: new Date().toISOString().split('T')[0],
            visit_count: visitor.visit_count + 1,
          });
        } else {
          const { data: newVisitor, error: visitorError } =
            await this.supabase.insert<Visitor>('visitors', {
              church_id: churchId,
              first_name: visitorData.first_name.trim(),
              last_name: visitorData.last_name.trim(),
              phone: visitorData.phone?.trim() || null,
              email: visitorData.email?.trim() || null,
              address: visitorData.address?.trim() || null,
              referred_by: visitorData.referred_by?.trim() || null,
              notes: visitorData.notes?.trim() || null,
              first_visit_date: new Date().toISOString().split('T')[0],
              last_visit_date: new Date().toISOString().split('T')[0],
              visit_count: 1,
              is_converted_to_member: false,
            } as any);

          if (visitorError) throw new Error(visitorError.message);
          visitor = newVisitor![0];
        }

        const { data: attendanceData, error: attendanceError } =
          await this.supabase.insert<AttendanceRecord>('attendance_records', {
            attendance_event_id: eventId,
            visitor_id: visitor!.id,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: 'manual',
            status: 'present',
          } as any);

        if (attendanceError) throw new Error(attendanceError.message);
        await this.updateEventAttendanceCount(eventId);
        return attendanceData![0];
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  bulkCheckIn(
    eventId: string,
    memberIds: string[],
  ): Observable<BulkCheckInResult> {
    if (!memberIds || memberIds.length === 0) {
      return throwError(() => new Error('No members selected'));
    }

    return from(
      (async () => {
        let success = 0;
        const errors: string[] = [];
        const failed_members: string[] = [];

        for (const memberId of memberIds) {
          try {
            await this.checkInMember(eventId, memberId, 'bulk').toPromise();
            success++;
          } catch (error: any) {
            errors.push(error.message || 'Unknown error');
            failed_members.push(memberId);
          }
        }

        return { success, errors, failed_members };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  removeAttendanceRecord(recordId: string, eventId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) throw new Error('Event not found or access denied');

        const { error } = await this.supabase.delete(
          'attendance_records',
          recordId,
        );
        if (error) throw new Error(error.message);

        await this.updateEventAttendanceCount(eventId);
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  private async updateEventAttendanceCount(eventId: string): Promise<void> {
    const { count: presentCount } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId)
      .eq('status', 'present');

    const { count: absentCount } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId)
      .eq('status', 'absent');

    await this.supabase.client
      .from('attendance_events')
      .update({
        total_attendance: presentCount || 0,
        total_absent: absentCount || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);
  }

  // ==================== STATISTICS & REPORTS ====================

  getAttendanceStatistics(): Observable<AttendanceStatistics> {
    const churchId = this.authService.getChurchId();
    const isBranchPastor = this.authService.isBranchPastor();
    const branchId = this.authService.getBranchId();

    return from(
      (async () => {
        let eventsQuery = this.supabase.client
          .from('attendance_events')
          .select('total_attendance', { count: 'exact' })
          .eq('church_id', churchId);

        let visitorsQuery = this.supabase.client
          .from('visitors')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        if (isBranchPastor && branchId) {
          eventsQuery = eventsQuery.eq('branch_id', branchId);
          visitorsQuery = visitorsQuery.eq('branch_id', branchId);
        }

        const { data: events, count: totalEvents } = await eventsQuery;
        const { count: totalVisitors } = await visitorsQuery;

        const { count: convertedVisitors } = await this.supabase.client
          .from('visitors')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('is_converted_to_member', true);

        const attendances = events?.map((e) => e.total_attendance) || [];
        const totalAttendance = attendances.reduce((sum, a) => sum + a, 0);
        const avgAttendance = events?.length
          ? Math.round(totalAttendance / events.length)
          : 0;

        return {
          total_events: totalEvents || 0,
          total_attendance: totalAttendance,
          avg_attendance: avgAttendance,
          highest_attendance: attendances.length ? Math.max(...attendances) : 0,
          lowest_attendance: attendances.length ? Math.min(...attendances) : 0,
          total_visitors: totalVisitors || 0,
          converted_visitors: convertedVisitors || 0,
        };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  getAttendanceReport(
    startDate: string,
    endDate: string,
    serviceType?: string,
  ): Observable<AttendanceReportData[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_events')
          .select(
            `id, event_type, event_date, expected_attendance, total_attendance, total_absent`,
          )
          .eq('church_id', churchId)
          .gte('event_date', startDate)
          .lte('event_date', endDate)
          .order('event_date', { ascending: false });

        if (serviceType) query = query.eq('event_type', serviceType);

        const { data: events, error } = await query;
        if (error) throw new Error(error.message);

        return (events || []).map((event) => {
          const totalMembers =
            event.expected_attendance || event.total_attendance;
          const totalPresent = event.total_attendance;
          const totalAbsent =
            event.total_absent || Math.max(0, totalMembers - totalPresent);
          const attendanceRate =
            totalMembers > 0
              ? Math.round((totalPresent / totalMembers) * 100)
              : 0;

          return {
            date: event.event_date,
            service_type: event.event_type,
            total_present: totalPresent,
            total_absent: totalAbsent,
            total_members: totalMembers,
            attendance_rate: attendanceRate,
          };
        });
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // ==================== VISITORS ====================

  getVisitors(
    page: number = 1,
    pageSize: number = 20,
  ): Observable<{ data: Visitor[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('visitors')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .order('last_visit_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);
        return { data: data as Visitor[], count: count || 0 };
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  convertVisitorToMember(
    visitorId: string,
    memberId: string,
  ): Observable<void> {
    return from(
      this.supabase.update<Visitor>('visitors', visitorId, {
        is_converted_to_member: true,
        member_id: memberId,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== QR CODE ====================

  generateQRCodeData(eventId: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/attendance/qr-checkin/${eventId}`;
  }

  verifyQRCheckIn(
    eventId: string,
    memberId: string,
  ): Observable<AttendanceRecord> {
    return this.publicQRCheckIn(eventId, memberId);
  }

  // ==================== EXPORT ====================

  exportAttendanceReport(eventId: string): Observable<Blob> {
    return this.getAttendanceRecords(eventId).pipe(
      map((records) => {
        const headers = [
          'Name',
          'Type',
          'Member Number',
          'Status',
          'Absence Reason',
          'Check-in Date',
          'Check-in Time',
          'Check-in Method',
        ];

        const rows = records.map((record: AttendanceRecord) => {
          const name = record.member
            ? `${record.member.first_name} ${record.member.last_name}`
            : record.visitor
              ? `${record.visitor.first_name} ${record.visitor.last_name}`
              : 'Unknown';

          const type = record.member ? 'Member' : 'Visitor';
          const memberNumber = record.member?.member_number || 'N/A';
          const status = record.status === 'present' ? 'Present' : 'Absent';
          const absenceReason = record.absence_reason || '';

          const checkedInDate = new Date(record.checked_in_at);
          const checkInDate = checkedInDate.toLocaleDateString('en-GB');
          const checkInTime = checkedInDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          const checkInMethod = record.check_in_method || 'manual';

          return [
            name,
            type,
            memberNumber,
            status,
            absenceReason,
            checkInDate,
            checkInTime,
            checkInMethod,
          ];
        });

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== MEMBER HISTORY ====================

  getMemberAttendanceHistory(
    memberId: string,
    limit: number = 50,
  ): Observable<AttendanceRecord[]> {
    return from(
      this.supabase.client
        .from('attendance_records')
        .select(
          `*, event:attendance_events(id, event_name, event_type, event_date)`,
        )
        .eq('member_id', memberId)
        .order('checked_in_at', { ascending: false })
        .limit(limit),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as any[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== PUBLIC QR ====================

  publicQRCheckIn(
    eventId: string,
    memberId: string,
  ): Observable<AttendanceRecord> {
    return from(
      (async () => {
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id, church_id')
          .eq('id', eventId)
          .single();

        if (!event) throw new Error('Event not found');

        // Check duplicate
        const { data: existing } = await this.supabase.client
          .from('attendance_records')
          .select('id, status')
          .eq('attendance_event_id', eventId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing?.status === 'present') {
          throw new Error('You have already checked in for this event');
        }

        const { data: member } = await this.supabase.client
          .from('members')
          .select('id, church_id')
          .eq('id', memberId)
          .eq('church_id', event.church_id)
          .single();

        if (!member) throw new Error('Member not found');

        if (existing?.status === 'absent') {
          // Flip absent → present
          const { data, error } = await this.supabase.client
            .from('attendance_records')
            .update({
              status: 'present',
              absence_reason: null,
              checked_in_at: new Date().toISOString(),
              check_in_method: 'qr_code',
              checked_in_by: null,
            })
            .eq('id', existing.id)
            .select()
            .single();

          if (error) throw new Error(error.message);
          await this.updatePublicEventAttendanceCount(eventId);
          return data as AttendanceRecord;
        }

        // Fresh insert — use raw client, no auth wrapper
        const { data, error } = await this.supabase.client
          .from('attendance_records')
          .insert({
            attendance_event_id: eventId,
            member_id: memberId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: null,
            check_in_method: 'qr_code',
            status: 'present',
          })
          .select()
          .single();

        if (error) throw new Error(error.message);
        await this.updatePublicEventAttendanceCount(eventId);
        return data as AttendanceRecord;
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  // Add this method to AttendanceService — public visitor check-in (no auth)
  checkInVisitorPublic(
    eventId: string,
    visitorData: {
      first_name: string;
      last_name: string;
      phone?: string;
      email?: string;
    },
  ): Observable<AttendanceRecord> {
    return from(
      (async () => {
        // Get event's church_id without auth
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id, church_id')
          .eq('id', eventId)
          .single();

        if (!event) throw new Error('Event not found');

        // Check for existing visitor by phone or email
        let visitorId: string | null = null;

        if (visitorData.phone || visitorData.email) {
          let q = this.supabase.client
            .from('visitors')
            .select('id, visit_count')
            .eq('church_id', event.church_id);

          if (visitorData.phone) q = q.eq('phone', visitorData.phone);
          else if (visitorData.email) q = q.eq('email', visitorData.email);

          const { data: existing } = await q.maybeSingle();

          if (existing) {
            // Update last visit
            await this.supabase.client
              .from('visitors')
              .update({
                last_visit_date: new Date().toISOString().split('T')[0],
                visit_count: existing.visit_count + 1,
              })
              .eq('id', existing.id);

            visitorId = existing.id;
          }
        }

        if (!visitorId) {
          // Create new visitor
          const { data: newVisitor, error: vErr } = await this.supabase.client
            .from('visitors')
            .insert({
              church_id: event.church_id,
              first_name: visitorData.first_name,
              last_name: visitorData.last_name,
              phone: visitorData.phone || null,
              email: visitorData.email || null,
              first_visit_date: new Date().toISOString().split('T')[0],
              last_visit_date: new Date().toISOString().split('T')[0],
              visit_count: 1,
              is_converted_to_member: false,
            })
            .select('id')
            .single();

          if (vErr) throw new Error(vErr.message);
          visitorId = newVisitor!.id;
        }

        // Insert attendance record
        const { data, error } = await this.supabase.client
          .from('attendance_records')
          .insert({
            attendance_event_id: eventId,
            visitor_id: visitorId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: null,
            check_in_method: 'self_service',
            status: 'present',
          })
          .select()
          .single();

        if (error) throw new Error(error.message);
        await this.updatePublicEventAttendanceCount(eventId);
        return data as AttendanceRecord;
      })(),
    ).pipe(catchError((err) => throwError(() => err)));
  }

  private async updatePublicEventAttendanceCount(
    eventId: string,
  ): Promise<void> {
    const { count: presentCount } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId)
      .eq('status', 'present');

    const { count: absentCount } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId)
      .eq('status', 'absent');

    await this.supabase.client
      .from('attendance_events')
      .update({
        total_attendance: presentCount || 0,
        total_absent: absentCount || 0,
      })
      .eq('id', eventId);
  }

  publicGetEvent(eventId: string): Observable<AttendanceEvent> {
    return from(
      this.supabase.client
        .from('attendance_events')
        .select('*')
        .eq('id', eventId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Event not found');
        return data as AttendanceEvent;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ── Helper: is event date in the past ──────────────────────────
  isEventPast(eventDate: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eDate = new Date(eventDate);
    eDate.setHours(0, 0, 0, 0);
    return eDate < today;
  }

  isEventToday(eventDate: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eDate = new Date(eventDate);
    eDate.setHours(0, 0, 0, 0);
    return eDate.getTime() === today.getTime();
  }
}
