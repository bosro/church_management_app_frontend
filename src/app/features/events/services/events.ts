// src/app/features/events/services/events.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import {
  ChurchEvent,
  EventCategory,
  EventRegistration,
} from '../../../models/event.model';

@Injectable({
  providedIn: 'root',
})
export class EventsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
  ) {}

  // ==================== PERMISSIONS ====================

  canManageEvents(): boolean {
    const roles = ['super_admin', 'church_admin', 'pastor', 'ministry_leader'];
    return this.authService.hasRole(roles);
  }

  canViewEvents(): boolean {
    return true;
  }

  canRegisterForEvents(): boolean {
    return true;
  }

  // ==================== EVENTS CRUD ====================

  getEvents(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      startDate?: string;
      endDate?: string;
      category?: EventCategory | 'all';
    },
  ): Observable<{ data: ChurchEvent[]; count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('events')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        if (filters?.startDate) {
          query = query.gte('start_date', filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte('start_date', filters.endDate);
        }
        if (filters?.category && filters.category !== 'all') {
          query = query.eq('category', filters.category);
        }

        const { data, error, count } = await query
          .order('start_date', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(error.message);

        return { data: data as ChurchEvent[], count: count || 0 };
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading events:', err);
        return throwError(() => err);
      }),
    );
  }

  getUpcomingEvents(limit: number = 10): Observable<ChurchEvent[]> {
    const churchId = this.authService.getChurchId();
    const today = new Date().toISOString().split('T')[0];

    return from(
      this.supabase.client
        .from('events')
        .select('*')
        .eq('church_id', churchId)
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(limit),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as ChurchEvent[];
      }),
      catchError((err) => {
        console.error('Error loading upcoming events:', err);
        return throwError(() => err);
      }),
    );
  }

  getEventById(eventId: string): Observable<ChurchEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.client
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Event not found');
        return data as ChurchEvent;
      }),
      catchError((err) => {
        console.error('Error loading event:', err);
        return throwError(() => err);
      }),
    );
  }

  createEvent(eventData: {
    title: string;
    description?: string;
    category: EventCategory;
    start_date: string;
    end_date: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    max_attendees?: number;
    registration_deadline?: string;
    registration_required?: boolean;
    is_public?: boolean;
  }): Observable<ChurchEvent> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    const startDateTime = this.combineDateAndTime(
      eventData.start_date,
      eventData.start_time,
    );
    const endDateTime = this.combineDateAndTime(
      eventData.end_date,
      eventData.end_time,
    );

    return from(
      this.supabase.insert<ChurchEvent>('events', {
        church_id: churchId,
        title: eventData.title,
        description: eventData.description || null,
        category: eventData.category,
        start_date: startDateTime,
        end_date: endDateTime,
        location: eventData.location || null,
        max_attendees: eventData.max_attendees || null,
        registration_deadline: eventData.registration_deadline || null,
        registration_required: eventData.registration_required || false,
        is_public:
          eventData.is_public !== undefined ? eventData.is_public : true,
        created_by: userId,
      } as any),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to create event');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error creating event:', err);
        return throwError(() => err);
      }),
    );
  }

  updateEvent(
    eventId: string,
    eventData: {
      title?: string;
      description?: string;
      category?: EventCategory;
      start_date?: string;
      end_date?: string;
      start_time?: string;
      end_time?: string;
      location?: string;
      max_attendees?: number;
      registration_deadline?: string;
      registration_required?: boolean;
      is_public?: boolean;
    },
  ): Observable<ChurchEvent> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Event not found or access denied');
        }

        const updateData: any = {
          ...eventData,
          updated_at: new Date().toISOString(),
        };

        if (eventData.start_date && eventData.start_time !== undefined) {
          updateData.start_date = this.combineDateAndTime(
            eventData.start_date,
            eventData.start_time,
          );
        }
        if (eventData.end_date && eventData.end_time !== undefined) {
          updateData.end_date = this.combineDateAndTime(
            eventData.end_date,
            eventData.end_time,
          );
        }

        delete updateData.start_time;
        delete updateData.end_time;

        return this.supabase.update<ChurchEvent>('events', eventId, updateData);
      })(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data || data.length === 0)
          throw new Error('Failed to update event');
        return data[0];
      }),
      catchError((err) => {
        console.error('Error updating event:', err);
        return throwError(() => err);
      }),
    );
  }

  deleteEvent(eventId: string): Observable<void> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data: existing } = await this.supabase.client
          .from('events')
          .select('id')
          .eq('id', eventId)
          .eq('church_id', churchId)
          .single();

        if (!existing) {
          throw new Error('Event not found or access denied');
        }

        return this.supabase.delete('events', eventId);
      })(),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => {
        console.error('Error deleting event:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== EVENT REGISTRATIONS ====================

  getEventRegistrations(eventId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('event_registrations')
        .select(
          `
          *,
          member:members(id, first_name, last_name, photo_url, member_number, email, phone_primary)
        `,
        )
        .eq('event_id', eventId)
        .order('registered_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data || [];
      }),
      catchError((err) => {
        console.error('Error loading registrations:', err);
        return throwError(() => err);
      }),
    );
  }

  registerForEvent(
    eventId: string,
    registrationData: {
      memberId?: string;
      name?: string;
      email?: string;
      phone?: string;
      notes?: string;
    },
  ): Observable<EventRegistration> {
    return from(
      (async () => {
        // Check if already registered
        if (registrationData.memberId) {
          const { data: existing } = await this.supabase.client
            .from('event_registrations')
            .select('*')
            .eq('event_id', eventId)
            .eq('member_id', registrationData.memberId)
            .maybeSingle();

          if (existing) {
            throw new Error('Already registered for this event');
          }
        }

        // Check event capacity
        const { data: event } = await this.supabase.client
          .from('events')
          .select('max_attendees')
          .eq('id', eventId)
          .single();

        if (event?.max_attendees) {
          const { count } = await this.supabase.client
            .from('event_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .in('status', ['confirmed', 'pending']);

          if (count && count >= event.max_attendees) {
            throw new Error('Event is full');
          }
        }

        // Create registration
        const { data, error } = await this.supabase.client
          .from('event_registrations')
          .insert({
            event_id: eventId,
            member_id: registrationData.memberId || null,
            name: registrationData.name || null,
            email: registrationData.email || null,
            phone: registrationData.phone || null,
            notes: registrationData.notes || null,
            status: 'confirmed',
            checked_in: false,
            registered_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw new Error(error.message);
        return data;
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error registering for event:', err);
        return throwError(() => err);
      }),
    );
  }

  updateRegistration(
    registrationId: string,
    data: Partial<EventRegistration>,
  ): Observable<EventRegistration> {
    return from(
      this.supabase.update<EventRegistration>(
        'event_registrations',
        registrationId,
        data,
      ),
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw new Error(error.message);
        if (!updatedData || updatedData.length === 0)
          throw new Error('Failed to update registration');
        return updatedData[0];
      }),
      catchError((err) => {
        console.error('Error updating registration:', err);
        return throwError(() => err);
      }),
    );
  }

  checkInRegistration(registrationId: string): Observable<EventRegistration> {
    return this.updateRegistration(registrationId, {
      checked_in: true,
      checked_in_at: new Date().toISOString(),
    });
  }

  cancelRegistration(registrationId: string): Observable<void> {
    return from(
      this.supabase.delete('event_registrations', registrationId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => {
        console.error('Error cancelling registration:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== STATISTICS ====================

  getEventStatistics(eventId: string): Observable<any> {
    return from(
      (async () => {
        const { count: totalRegistrations } = await this.supabase.client
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId);

        const { count: checkedIn } = await this.supabase.client
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('checked_in', true);

        const { count: confirmed } = await this.supabase.client
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'confirmed');

        return {
          total_registrations: totalRegistrations || 0,
          checked_in: checkedIn || 0,
          confirmed: confirmed || 0,
          pending: (totalRegistrations || 0) - (confirmed || 0),
        };
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error loading statistics:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== EXPORT ====================

  exportEventRegistrations(eventId: string): Observable<Blob> {
    return this.getEventRegistrations(eventId).pipe(
      map((registrations) => {
        if (registrations.length === 0) {
          throw new Error('No registrations to export');
        }

        const headers = [
          'Name',
          'Email',
          'Phone',
          'Status',
          'Registered At',
          'Checked In',
          'Check-in Time',
          'Notes',
        ];

        const rows = registrations.map((reg: any) => {
          const name = reg.member
            ? `${reg.member.first_name} ${reg.member.last_name}`
            : reg.name || 'N/A';
          const email = reg.member?.email || reg.email || '';
          const phone = reg.member?.phone_primary || reg.phone || '';

          return [
            name,
            email,
            phone,
            reg.status,
            new Date(reg.registered_at).toLocaleString(),
            reg.checked_in ? 'Yes' : 'No',
            reg.checked_in_at
              ? new Date(reg.checked_in_at).toLocaleString()
              : '',
            reg.notes || '',
          ];
        });

        const csv = [
          headers.join(','),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
        ].join('\n');

        return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      }),
      catchError((err) => {
        console.error('Error exporting registrations:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== SEARCH MEMBERS FOR REGISTRATION ====================

  searchMembersForEvent(eventId: string, query: string): Observable<any[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        // Get already registered members
        const { data: registered } = await this.supabase.client
          .from('event_registrations')
          .select('member_id')
          .eq('event_id', eventId)
          .not('member_id', 'is', null);

        const registeredIds =
          registered?.map((r) => r.member_id).filter(Boolean) || [];

        // Search members not registered
        let searchQuery = this.supabase.client
          .from('members')
          .select(
            'id, first_name, last_name, photo_url, member_number, phone_primary, email',
          )
          .eq('church_id', churchId);

        // Exclude already registered members
        if (registeredIds.length > 0) {
          searchQuery = searchQuery.not(
            'id',
            'in',
            `(${registeredIds.join(',')})`,
          );
        }

        // Search by name, email, or phone
        searchQuery = searchQuery.or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone_primary.ilike.%${query}%`,
        );

        const { data, error } = await searchQuery.limit(10);

        if (error) throw new Error(error.message);
        return data || [];
      })(),
    ).pipe(
      catchError((err) => {
        console.error('Error searching members:', err);
        return throwError(() => err);
      }),
    );
  }

  // ==================== HELPER METHODS ====================

  private combineDateAndTime(date: string, time?: string): string {
    if (!time) {
      return date;
    }
    return `${date}T${time}:00`;
  }

  private extractTime(datetime: string): string {
    if (!datetime) return '';
    const date = new Date(datetime);
    return date.toTimeString().slice(0, 5); // HH:MM format
  }
}
