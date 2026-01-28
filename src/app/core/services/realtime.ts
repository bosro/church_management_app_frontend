// src/app/core/services/realtime.service.ts
import { Injectable } from '@angular/core';
import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { Subject, Observable } from 'rxjs';
import { SupabaseService } from './supabase';

export interface RealtimeEvent<T = any> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  new: T | null;
  old: T | null;
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private eventSubjects: Map<string, Subject<RealtimeEvent>> = new Map();

  constructor(private supabase: SupabaseService) {}

  // Subscribe to table changes
  subscribeToTable<T extends Record<string, any>>(
    channelName: string,
    table: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*' = '*',
    filter?: string,
  ): Observable<RealtimeEvent<T>> {
    const key = `${channelName}-${table}-${event}`;

    if (!this.eventSubjects.has(key)) {
      const subject = new Subject<RealtimeEvent<T>>();
      this.eventSubjects.set(key, subject);

      const channel = this.supabase.client
        .channel(channelName)
        .on(
          'postgres_changes' as const,
          {
            event,
            schema: 'public',
            table,
            filter,
          },
          (payload: RealtimePostgresChangesPayload<T>) => {
            subject.next({
              eventType: payload.eventType,
              table: payload.table,
              new: payload.new ?? null,
              old: payload.old ?? null,
            });
          },
        )
        .subscribe();

      this.channels.set(key, channel);
    }

    return this.eventSubjects.get(key)!.asObservable();
  }

  // Subscribe to user messages
  subscribeToUserMessages(memberId: string): Observable<RealtimeEvent> {
    return this.subscribeToTable(
      'user-messages',
      'message_recipients',
      'INSERT',
      `member_id=eq.${memberId}`,
    );
  }

  // Subscribe to attendance updates
  subscribeToAttendanceUpdates(eventId: string): Observable<RealtimeEvent> {
    return this.subscribeToTable(
      'attendance-updates',
      'attendance_records',
      'INSERT',
      `attendance_event_id=eq.${eventId}`,
    );
  }

  // Subscribe to giving transactions
  subscribeToGivingTransactions(churchId: string): Observable<RealtimeEvent> {
    return this.subscribeToTable(
      'giving-updates',
      'giving_transactions',
      'INSERT',
      `church_id=eq.${churchId}`,
    );
  }

  // Unsubscribe from channel
  unsubscribe(channelName: string): void {
    const keysToRemove: string[] = [];

    this.channels.forEach((channel, key) => {
      if (key.startsWith(channelName)) {
        channel.unsubscribe();
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach((key) => {
      this.channels.delete(key);
      const subject = this.eventSubjects.get(key);
      if (subject) {
        subject.complete();
        this.eventSubjects.delete(key);
      }
    });
  }

  // Unsubscribe from all channels
  unsubscribeAll(): void {
    this.channels.forEach((channel) => {
      channel.unsubscribe();
    });
    this.channels.clear();

    this.eventSubjects.forEach((subject) => {
      subject.complete();
    });
    this.eventSubjects.clear();
  }
}
