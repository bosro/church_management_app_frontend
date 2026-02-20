// src/app/features/attendance/services/attendance.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  AttendanceEvent,
  AttendanceEventType,
  AttendanceRecord,
  Visitor,
  AttendanceStatistics,
  AttendanceReportData,
  BulkCheckInResult,
  VisitorCheckInData,
  CheckInMethod
} from '../../../models/attendance.model';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ==================== PERMISSIONS ====================

  canManageAttendance(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewAttendance(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary'];
    return this.authService.hasRole(roles);
  }

  canMarkAttendance(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'usher'];
    return this.authService.hasRole(roles);
  }

  // ==================== ATTENDANCE EVENTS ====================

  getAttendanceEvents(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      eventType?: AttendanceEventType;
      startDate?: string;
      endDate?: string;
    }
  ): Observable<{ data: AttendanceEvent[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_events')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.eventType) {
          query = query.eq('event_type', filters.eventType);
        }
        if (filters?.startDate) {
          query = query.gte('event_date', filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte('event_date', filters.endDate);
        }

        const { data, error, count } = await query
          .order('event_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as AttendanceEvent[], count: count || 0 };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading attendance events:', err);
        return throwError(() => err);
      })
    );
  }

  getAttendanceEventById(eventId: string): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('attendance_events')
        .select('*')
        .eq('id', eventId)
        .eq('church_id', churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Event not found');
        return data as AttendanceEvent;
      }),
      catchError(err => {
        console.error('Error loading event:', err);
        return throwError(() => err);
      })
    );
  }

  createAttendanceEvent(
    eventData: {
      event_type: AttendanceEventType;
      event_name: string;
      event_date: string;
      event_time?: string;
      location?: string;
      expected_attendance?: number;
      notes?: string;
    }
  ): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    // Validate event date
    const eventDate = new Date(eventData.event_date);
    if (isNaN(eventDate.getTime())) {
      return throwError(() => new Error('Invalid event date'));
    }

    return from(
      this.supabase.insert<AttendanceEvent>('attendance_events', {
        church_id: churchId,
        event_type: eventData.event_type,
        event_name: eventData.event_name.trim(),
        event_date: eventData.event_date,
        event_time: eventData.event_time || null,
        location: eventData.location?.trim() || null,
        expected_attendance: eventData.expected_attendance || null,
        notes: eventData.notes?.trim() || null,
        total_attendance: 0,
        created_by: userId
      } as any)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to create event');
        return data[0];
      }),
      catchError(err => {
        console.error('Error creating event:', err);
        return throwError(() => err);
      })
    );
  }

  updateAttendanceEvent(
    eventId: string,
    eventData: Partial<AttendanceEvent>
  ): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Event not found or access denied');
        }

        const updateData = {
          ...eventData,
          updated_at: new Date().toISOString()
        };

        return this.supabase.update<AttendanceEvent>('attendance_events', eventId, updateData);
      })()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error('Failed to update event');
        return data[0];
      }),
      catchError(err => {
        console.error('Error updating event:', err);
        return throwError(() => err);
      })
    );
  }

  deleteAttendanceEvent(eventId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify ownership
        const { data: existing } = await this.supabase.client
          .from('attendance_events')
          .select('id, total_attendance')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Event not found or access denied');
        }

        // Warn if event has attendance records
        if (existing.total_attendance > 0) {
          console.warn(`Deleting event with ${existing.total_attendance} attendance records`);
        }

        return this.supabase.delete('attendance_events', eventId);
      })()
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error deleting event:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== ATTENDANCE RECORDS ====================

  getAttendanceRecords(
    eventId: string,
    filters?: {
      memberType?: 'member' | 'visitor';
    }
  ): Observable<AttendanceRecord[]> {
    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_records')
          .select(`
            *,
            member:members(id, first_name, last_name, middle_name, photo_url, member_number),
            visitor:visitors(id, first_name, last_name)
          `)
          .eq('attendance_event_id', eventId);

        if (filters?.memberType === 'member') {
          query = query.not('member_id', 'is', null);
        } else if (filters?.memberType === 'visitor') {
          query = query.not('visitor_id', 'is', null);
        }

        const { data, error } = await query.order('checked_in_at', { ascending: false });

        if (error) throw new Error(error.message);

        return data as AttendanceRecord[];
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading attendance records:', err);
        return throwError(() => err);
      })
    );
  }

  checkInMember(
    eventId: string,
    memberId: string,
    method: CheckInMethod = 'manual'
  ): Observable<AttendanceRecord> {
    const userId = this.authService.getUserId();
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify event exists and belongs to church
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) {
          throw new Error('Event not found or access denied');
        }

        // Check if already checked in
        const { data: existing } = await this.supabase.client
          .from('attendance_records')
          .select('id')
          .eq('attendance_event_id', eventId)
          .eq('member_id', memberId)
          .maybeSingle();

        if (existing) {
          throw new Error('Member already checked in for this event');
        }

        // Verify member exists
        const { data: member } = await this.supabase.client
          .from('members')
          .select('id')
          .eq('id', memberId)
          .eq('church_id', churchId)
          .single();

        if (!member) {
          throw new Error('Member not found');
        }

        // Create attendance record
        const { data, error } = await this.supabase.insert<AttendanceRecord>(
          'attendance_records',
          {
            attendance_event_id: eventId,
            member_id: memberId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: method
          } as any
        );

        if (error) throw new Error(error.message);

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);

        return data![0];
      })()
    ).pipe(
      catchError(err => {
        console.error('Check-in error:', err);
        return throwError(() => err);
      })
    );
  }

  checkInVisitor(
    eventId: string,
    visitorData: VisitorCheckInData
  ): Observable<AttendanceRecord> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    // Validate required fields
    if (!visitorData.first_name || !visitorData.last_name) {
      return throwError(() => new Error('Visitor name is required'));
    }

    return from(
      (async () => {
        // Verify event exists
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) {
          throw new Error('Event not found or access denied');
        }

        // Check for existing visitor by phone or email
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
          // Update existing visitor
          await this.supabase.update('visitors', visitor.id, {
            last_visit_date: new Date().toISOString().split('T')[0],
            visit_count: visitor.visit_count + 1
          });
        } else {
          // Create new visitor
          const { data: newVisitor, error: visitorError } = await this.supabase.insert<Visitor>(
            'visitors',
            {
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
              is_converted_to_member: false
            } as any
          );

          if (visitorError) throw new Error(visitorError.message);
          visitor = newVisitor![0];
        }

        // Create attendance record
        const { data: attendanceData, error: attendanceError } = await this.supabase.insert<AttendanceRecord>(
          'attendance_records',
          {
            attendance_event_id: eventId,
            visitor_id: visitor!.id,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: 'manual'
          } as any
        );

        if (attendanceError) throw new Error(attendanceError.message);

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);

        return attendanceData![0];
      })()
    ).pipe(
      catchError(err => {
        console.error('Visitor check-in error:', err);
        return throwError(() => err);
      })
    );
  }

  bulkCheckIn(
    eventId: string,
    memberIds: string[]
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
      })()
    ).pipe(
      catchError(err => {
        console.error('Bulk check-in error:', err);
        return throwError(() => err);
      })
    );
  }

  removeAttendanceRecord(recordId: string, eventId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Verify event belongs to church
        const { data: event } = await this.supabase.client
          .from('attendance_events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!event) {
          throw new Error('Event not found or access denied');
        }

        const { error } = await this.supabase.delete('attendance_records', recordId);
        if (error) throw new Error(error.message);

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);
      })()
    ).pipe(
      catchError(err => {
        console.error('Error removing attendance record:', err);
        return throwError(() => err);
      })
    );
  }

  private async updateEventAttendanceCount(eventId: string): Promise<void> {
    const { count } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId);

    await this.supabase.update('attendance_events', eventId, {
      total_attendance: count || 0
    });
  }

  // ==================== STATISTICS & REPORTS ====================

  getAttendanceStatistics(): Observable<AttendanceStatistics> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Total events
        const { count: totalEvents } = await this.supabase.client
          .from('attendance_events')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        // Get all events with attendance
        const { data: events } = await this.supabase.client
          .from('attendance_events')
          .select('total_attendance')
          .eq('church_id', churchId);

        const attendances = events?.map(e => e.total_attendance) || [];
        const totalAttendance = attendances.reduce((sum, a) => sum + a, 0);
        const avgAttendance = events && events.length > 0
          ? Math.round(totalAttendance / events.length)
          : 0;

        // Visitors
        const { count: totalVisitors } = await this.supabase.client
          .from('visitors')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId);

        const { count: convertedVisitors } = await this.supabase.client
          .from('visitors')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('is_converted_to_member', true);

        return {
          total_events: totalEvents || 0,
          total_attendance: totalAttendance,
          avg_attendance: avgAttendance,
          highest_attendance: attendances.length > 0 ? Math.max(...attendances) : 0,
          lowest_attendance: attendances.length > 0 ? Math.min(...attendances) : 0,
          total_visitors: totalVisitors || 0,
          converted_visitors: convertedVisitors || 0
        };
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      })
    );
  }

  getAttendanceReport(
    startDate: string,
    endDate: string,
    serviceType?: string
  ): Observable<AttendanceReportData[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_events')
          .select(`
            id,
            event_type,
            event_date,
            expected_attendance,
            total_attendance
          `)
          .eq('church_id', churchId)
          .gte('event_date', startDate)
          .lte('event_date', endDate)
          .order('event_date', { ascending: false });

        if (serviceType) {
          query = query.eq('event_type', serviceType);
        }

        const { data: events, error } = await query;

        if (error) throw new Error(error.message);

        // Transform to report format
        const reports: AttendanceReportData[] = (events || []).map(event => {
          const totalMembers = event.expected_attendance || event.total_attendance;
          const totalPresent = event.total_attendance;
          const totalAbsent = Math.max(0, totalMembers - totalPresent);
          const attendanceRate = totalMembers > 0
            ? Math.round((totalPresent / totalMembers) * 100)
            : 0;

          return {
            date: event.event_date,
            service_type: event.event_type,
            total_present: totalPresent,
            total_absent: totalAbsent,
            total_members: totalMembers,
            attendance_rate: attendanceRate
          };
        });

        return reports;
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading report:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== VISITORS ====================

  getVisitors(
    page: number = 1,
    pageSize: number = 20
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
      })()
    ).pipe(
      catchError(err => {
        console.error('Error loading visitors:', err);
        return throwError(() => err);
      })
    );
  }

  convertVisitorToMember(visitorId: string, memberId: string): Observable<void> {
    return from(
      this.supabase.update<Visitor>('visitors', visitorId, {
        is_converted_to_member: true,
        member_id: memberId
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => {
        console.error('Error converting visitor:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== QR CODE ====================

  generateQRCodeData(eventId: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/attendance/qr-checkin/${eventId}`;
  }

  verifyQRCheckIn(eventId: string, memberId: string): Observable<AttendanceRecord> {
    return this.checkInMember(eventId, memberId, 'qr_code');
  }

  // ==================== EXPORT ====================

  exportAttendanceReport(eventId: string): Observable<Blob> {
    return this.getAttendanceRecords(eventId).pipe(
      map((records) => {
        const headers = [
          'Name',
          'Type',
          'Member Number',
          'Check-in Time',
          'Check-in Method'
        ];

        const rows = records.map((record) => {
          const name = record.member
            ? `${record.member.first_name} ${record.member.last_name}`
            : record.visitor
            ? `${record.visitor.first_name} ${record.visitor.last_name}`
            : 'Unknown';

          const type = record.member ? 'Member' : 'Visitor';
          const memberNumber = record.member?.member_number || 'N/A';
          const checkInTime = new Date(record.checked_in_at).toLocaleString();
          const method = record.check_in_method;

          return [name, type, memberNumber, checkInTime, method];
        });

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      }),
      catchError(err => {
        console.error('Export error:', err);
        return throwError(() => err);
      })
    );
  }

  // ==================== MEMBER HISTORY ====================

  getMemberAttendanceHistory(
    memberId: string,
    limit: number = 50
  ): Observable<AttendanceRecord[]> {
    return from(
      this.supabase.client
        .from('attendance_records')
        .select(`
          *,
          event:attendance_events(id, event_name, event_type, event_date)
        `)
        .eq('member_id', memberId)
        .order('checked_in_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as any[];
      }),
      catchError(err => {
        console.error('Error loading member history:', err);
        return throwError(() => err);
      })
    );
  }
}
