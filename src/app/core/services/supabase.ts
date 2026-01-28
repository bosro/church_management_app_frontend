// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser$: Observable<User | null>;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
    );

    this.currentUserSubject = new BehaviorSubject<User | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();

    // Initialize auth state
    this.initializeAuthState();
  }

  private async initializeAuthState() {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    this.currentUserSubject.next(session?.user ?? null);

    // Listen to auth changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.currentUserSubject.next(session?.user ?? null);
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Helper methods for common operations
  async query<T>(
    table: string,
    options?: {
      select?: string;
      filters?: Record<string, any>;
      order?: { column: string; ascending?: boolean };
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: T[] | null; error: any }> {
    let query = this.supabase.from(table).select(options?.select || '*');

    if (options?.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const { data, error } = await query;

    return {
      data: data as T[] | null,
      error,
    };
  }

  async insert<T>(
    table: string,
    data: Partial<T> | Partial<T>[],
  ): Promise<{ data: T[] | null; error: any }> {
    return await this.supabase
      .from(table)
      .insert(data as any)
      .select();
  }

  async update<T>(
    table: string,
    id: string,
    data: Partial<T>,
  ): Promise<{ data: T[] | null; error: any }> {
    return await this.supabase
      .from(table)
      .update(data as any)
      .eq('id', id)
      .select();
  }

  async delete(table: string, id: string): Promise<{ error: any }> {
    return await this.supabase.from(table).delete().eq('id', id);
  }

  async callFunction<T>(
    functionName: string,
    params?: Record<string, any>,
  ): Promise<{ data: T | null; error: any }> {
    return await this.supabase.rpc(functionName, params);
  }

  async invokeEdgeFunction<T>(
    functionName: string,
    body?: Record<string, any>,
  ): Promise<{ data: T | null; error: any }> {
    return await this.supabase.functions.invoke(functionName, {
      body: body,
    });
  }
}
