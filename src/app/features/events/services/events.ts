// src/app/features/events/services/events.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { Event, EventCategory, EventRegistration } from '../../../models/event.model';


@Injectable({
  providedIn: 'root'
})
export class EventsService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // EVENTS CRUD
  getEvents(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      startDate?: string;
      endDate?: string;
      EventCategory?: EventCategory;
    }
  ): Observable<{ data: Event[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        let query = this.supabase.client
          .from('events')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId);

        // Apply filters
        if (filters?.startDate) {
          query = query.gte('start_date', filters.startDate);
        }
        if (filters?.endDate) {
          query = query.lte('start_date', filters.endDate);
        }
        if (filters?.EventCategory) {
          query = query.eq('event_type', filters.EventCategory);
        }

        const { data, error, count } = await query
          .order('start_date', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data as Event[], count: count || 0 };
      })()
    );
  }

  getUpcomingEvents(limit: number = 10): Observable<Event[]> {
    const churchId = this.authService.getChurchId();
    const today = new Date().toISOString().split('T')[0];

    return from(
      this.supabase.client
        .from('events')
        .select('*')
        .eq('church_id', churchId)
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Event[];
      })
    );
  }

  getEventById(eventId: string): Observable<Event> {
    return from(
      this.supabase.query<Event>('events', {
        filters: { id: eventId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Event not found');
        return data[0];
      })
    );
  }

  createEvent(eventData: Partial<Event>): Observable<Event> {
    const churchId = this.authService.getChurchId();
    const userId = this.authService.getUserId();

    return from(
      this.supabase.insert<Event>('events', {
        ...eventData,
        church_id: churchId,
        created_by: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateEvent(eventId: string, eventData: Partial<Event>): Observable<Event> {
    return from(
      this.supabase.update<Event>('events', eventId, eventData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteEvent(eventId: string): Observable<void> {
    return from(
      this.supabase.delete('events', eventId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // EVENT REGISTRATIONS
  getEventRegistrations(eventId: string): Observable<any[]> {
    return from(
      this.supabase.client
        .from('event_registrations')
        .select(`
          *,
          member:members(id, first_name, last_name, photo_url, member_number, email, phone_primary)
        `)
        .eq('event_id', eventId)
        .order('registered_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
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
    }
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
            .single();

          if (existing) {
            throw new Error('Already registered for this event');
          }
        }

        // Check event capacity
        const event = await this.getEventById(eventId).toPromise();
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
        const { data, error } = await this.supabase.insert<EventRegistration>(
          'event_registrations',
          {
            event_id: eventId,
            member_id: registrationData.memberId ?? undefined,
            name: registrationData.name ?? undefined,
            email: registrationData.email ?? undefined,
            phone: registrationData.phone ?? undefined,
            notes: registrationData.notes ?? undefined,
            status: 'confirmed',
            checked_in: false
          }
        );

        if (error) throw error;
        return data![0];
      })()
    );
  }

  updateRegistration(
    registrationId: string,
    data: Partial<EventRegistration>
  ): Observable<EventRegistration> {
    return from(
      this.supabase.update<EventRegistration>('event_registrations', registrationId, data)
    ).pipe(
      map(({ data: updatedData, error }) => {
        if (error) throw error;
        return updatedData![0];
      })
    );
  }

  checkInRegistration(registrationId: string): Observable<EventRegistration> {
    return this.updateRegistration(registrationId, {
      checked_in: true,
      checked_in_at: new Date().toISOString()
    });
  }

  cancelRegistration(registrationId: string): Observable<void> {
    return from(
      this.supabase.delete('event_registrations', registrationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // STATISTICS
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
          pending: (totalRegistrations || 0) - (confirmed || 0)
        };
      })()
    );
  }

  // EXPORT
  exportEventRegistrations(eventId: string): Observable<Blob> {
    return this.getEventRegistrations(eventId).pipe(
      map((registrations) => {
        const headers = [
          'Name', 'Email', 'Phone', 'Status', 'Registered At', 'Checked In', 'Notes'
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
            reg.notes || ''
          ];
        });

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return new Blob([csv], { type: 'text/csv' });
      })
    );
  }

  // SEARCH MEMBERS FOR REGISTRATION
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

        const registeredIds = registered?.map(r => r.member_id).filter(Boolean) || [];

        // Search members not registered
        let searchQuery = this.supabase.client
          .from('members')
          .select('id, first_name, last_name, photo_url, member_number, phone_primary, email')
          .eq('church_id', churchId);

        // Exclude already registered members
        if (registeredIds.length > 0) {
          searchQuery = searchQuery.not('id', 'in', `(${registeredIds.join(',')})`);
        }

        // Search by name, email, or phone
        searchQuery = searchQuery.or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone_primary.ilike.%${query}%`
        );

        const { data, error } = await searchQuery.limit(10);

        if (error) throw error;
        return data || [];
      })()
    );
  }
}
