// src/app/features/attendance/services/attendance.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
  AttendanceEvent,
  AttendanceRecord,
  Visitor,
  AttendanceEventType,
} from '../../../models/attendance.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // Get all attendance events
  getAttendanceEvents(
    page: number = 1,
    pageSize: number = 20,
    eventType?: AttendanceEventType,
  ): Observable<{ data: AttendanceEvent[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_events')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        if (eventType) {
          query = query.eq('event_type', eventType);
        }

        query = query
          .order('event_date', { ascending: false })
          .range(offset, offset + pageSize - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        return { data: data as AttendanceEvent[], count: count || 0 };
      })(),
    );
  }

  // Get single attendance event
  getAttendanceEventById(eventId: string): Observable<AttendanceEvent> {
    return from(
      this.supabase.query<AttendanceEvent>('attendance_events', {
        filters: { id: eventId },
        limit: 1,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Event not found');
        return data[0];
      }),
    );
  }

  // Create attendance event
  createAttendanceEvent(
    eventData: Partial<AttendanceEvent>,
  ): Observable<AttendanceEvent> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.currentProfile?.id;

    return from(
      this.supabase.insert<AttendanceEvent>('attendance_events', {
        ...eventData,
        church_id: churchId,
        created_by: userId,
        total_attendance: 0,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  // Update attendance event
  updateAttendanceEvent(
    eventId: string,
    eventData: Partial<AttendanceEvent>,
  ): Observable<AttendanceEvent> {
    return from(
      this.supabase.update<AttendanceEvent>(
        'attendance_events',
        eventId,
        eventData,
      ),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      }),
    );
  }

  // Delete attendance event
  deleteAttendanceEvent(eventId: string): Observable<void> {
    return from(this.supabase.delete('attendance_events', eventId)).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
    );
  }

  // Get attendance records for an event
  getAttendanceRecords(eventId: string): Observable<AttendanceRecord[]> {
    return from(
      this.supabase.client
        .from('attendance_records')
        .select(
          `
          *,
          member:members(id, first_name, last_name, photo_url, member_number),
          visitor:visitors(id, first_name, last_name)
        `,
        )
        .eq('attendance_event_id', eventId)
        .order('checked_in_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as any[];
      }),
    );
  }

  // Check in member
  checkInMember(
    eventId: string,
    memberId: string,
    method: string = 'manual',
  ): Observable<AttendanceRecord> {
    const userId = this.authService.currentProfile?.id;

    return from(
      (async () => {
        // Check if already checked in
        const { data: existing } = await this.supabase.client
          .from('attendance_records')
          .select('*')
          .eq('attendance_event_id', eventId)
          .eq('member_id', memberId)
          .single();

        if (existing) {
          throw new Error('Member already checked in for this event');
        }

        // Create attendance record
        const { data, error } = await this.supabase.insert<AttendanceRecord>(
          'attendance_records',
          {
            attendance_event_id: eventId,
            member_id: memberId,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: method,
          },
        );

        if (error) throw error;

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);

        return data![0];
      })(),
    );
  }

  // Check in visitor
  checkInVisitor(
    eventId: string,
    visitorData: Partial<Visitor>,
  ): Observable<AttendanceRecord> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.currentProfile?.id;

    return from(
      (async () => {
        // Create or get visitor
        let visitor: Visitor;

        if (visitorData.id) {
          // Existing visitor
          const { data } = await this.supabase.query<Visitor>('visitors', {
            filters: { id: visitorData.id },
            limit: 1,
          });
          visitor = data![0];

          // Update visit count and last visit date
          await this.supabase.update('visitors', visitor.id, {
            last_visit_date: new Date().toISOString().split('T')[0],
            visit_count: visitor.visit_count + 1,
          });
        } else {
          // New visitor
          const { data } = await this.supabase.insert<Visitor>('visitors', {
            ...visitorData,
            church_id: churchId,
            first_visit_date: new Date().toISOString().split('T')[0],
            last_visit_date: new Date().toISOString().split('T')[0],
            visit_count: 1,
            is_converted_to_member: false,
          });
          visitor = data![0];
        }

        // Create attendance record
        const { data: attendanceData, error } =
          await this.supabase.insert<AttendanceRecord>('attendance_records', {
            attendance_event_id: eventId,
            visitor_id: visitor.id,
            checked_in_at: new Date().toISOString(),
            checked_in_by: userId,
            check_in_method: 'manual',
          });

        if (error) throw error;

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);

        return attendanceData![0];
      })(),
    );
  }

  // Bulk check-in members
  bulkCheckIn(
    eventId: string,
    memberIds: string[],
  ): Observable<{ success: number; errors: string[] }> {
    return from(
      (async () => {
        let success = 0;
        const errors: string[] = [];

        for (const memberId of memberIds) {
          try {
            await this.checkInMember(eventId, memberId, 'bulk').toPromise();
            success++;
          } catch (error: any) {
            errors.push(`Member ${memberId}: ${error.message}`);
          }
        }

        return { success, errors };
      })(),
    );
  }

  // Remove attendance record
  removeAttendanceRecord(recordId: string, eventId: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.delete(
          'attendance_records',
          recordId,
        );
        if (error) throw error;

        // Update event total attendance
        await this.updateEventAttendanceCount(eventId);
      })(),
    );
  }

  // Update event attendance count
  private async updateEventAttendanceCount(eventId: string): Promise<void> {
    const { count } = await this.supabase.client
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_event_id', eventId);

    await this.supabase.update('attendance_events', eventId, {
      total_attendance: count || 0,
    });
  }

  // Get attendance statistics
  getAttendanceStatistics(): Observable<any> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.callFunction('get_attendance_stats', {
        church_uuid: churchId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
    );
  }

  // Get member attendance history
  getMemberAttendanceHistory(memberId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('attendance_records')
        .select(
          `
          *,
          event:attendance_events(id, event_name, event_type, event_date)
        `,
        )
        .eq('member_id', memberId)
        .order('checked_in_at', { ascending: false })
        .limit(50),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
    );
  }

  // Get visitors
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

        if (error) throw error;

        return { data: data as Visitor[], count: count || 0 };
      })(),
    );
  }

  // Convert visitor to member
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
        if (error) throw error;
      }),
    );
  }

  // Generate QR code data for event
  generateQRCodeData(eventId: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/attendance/qr-checkin/${eventId}`;
  }

  // Verify QR check-in
  verifyQRCheckIn(
    eventId: string,
    memberId: string,
  ): Observable<AttendanceRecord> {
    return this.checkInMember(eventId, memberId, 'qr_code');
  }

  // Export attendance report
  exportAttendanceReport(eventId: string): Observable<Blob> {
    return this.getAttendanceRecords(eventId).pipe(
      map((records) => {
        const headers = [
          'Name',
          'Type',
          'Member Number',
          'Check-in Time',
          'Check-in Method',
        ];

        const rows = records.map((record: any) => [
          record.member
            ? `${record.member.first_name} ${record.member.last_name}`
            : `${record.visitor.first_name} ${record.visitor.last_name}`,
          record.member ? 'Member' : 'Visitor',
          record.member?.member_number || 'N/A',
          new Date(record.checked_in_at).toLocaleString(),
          record.check_in_method,
        ]);

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      }),
    );
  }

  /**
   * Get attendance report with statistics for date range
   * ADD THIS METHOD TO YOUR EXISTING AttendanceService
   */
  getAttendanceReport(
    startDate: string,
    endDate: string,
    serviceType?: string,
  ): Observable<any[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        let query = this.supabase.client
          .from('attendance_records')
          .select(
            `
          *,
          members:member_id (
            id,
            full_name
          )
        `,
          )
          .eq('church_id', churchId)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate)
          .order('attendance_date', { ascending: false });

        if (serviceType) {
          query = query.eq('service_type', serviceType);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Group by date and service type to create report
        const reportMap = new Map<string, any>();

        data.forEach((record: any) => {
          const key = `${record.attendance_date}_${record.service_type}`;

          if (!reportMap.has(key)) {
            reportMap.set(key, {
              date: record.attendance_date,
              service_type: record.service_type,
              total_present: 0,
              total_absent: 0,
              total_members: 0,
              attendance_rate: 0,
            });
          }

          const reportEntry = reportMap.get(key);
          reportEntry.total_members++;

          if (record.status === 'present') {
            reportEntry.total_present++;
          } else if (record.status === 'absent') {
            reportEntry.total_absent++;
          }
        });

        // Calculate attendance rates
        const reports = Array.from(reportMap.values()).map((report) => {
          report.attendance_rate =
            report.total_members > 0
              ? Math.round((report.total_present / report.total_members) * 100)
              : 0;
          return report;
        });

        // Sort by date descending
        reports.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        return reports;
      })(),
    ).pipe(
      map((data) => data),
      catchError((error) => {
        console.error('Error fetching attendance report:', error);
        return throwError(
          () => new Error(error.message || 'Failed to fetch attendance report'),
        );
      }),
    );
  }
}
