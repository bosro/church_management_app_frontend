// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  // Custom lock function that bypasses Navigator Locks API
  // This solves the Angular + Supabase lock conflict
  private noOpLock = async (
    name: string,
    acquireTimeout: number,
    fn: () => Promise<any>
  ) => {
    // Simply execute the function without acquiring any locks
    return await fn();
  };

  private readonly supabase: SupabaseClient;

  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser$: Observable<User | null>;

  // ✅ NEW: Track auth initialization
  private authInitializedSubject = new BehaviorSubject<boolean>(false);
  public authInitialized$ = this.authInitializedSubject.asObservable();

  private isInitialized = false;

  constructor() {
    // Create client with custom lock bypass
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          // CRITICAL FIX: Use custom lock function that doesn't use Navigator Locks
          lock: this.noOpLock,
        }
      }
    );

    this.currentUserSubject = new BehaviorSubject<User | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();

    // Initialize auth state
    this.initializeAuthState();
  }

  private async initializeAuthState(): Promise<void> {
    if (this.isInitialized) return;

    // Small delay for good measure
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();

      if (error) {
        console.error('Error getting session:', error);
      }

      this.currentUserSubject.next(session?.user ?? null);
      this.isInitialized = true;

      // ✅ NEW: Mark auth as initialized
      this.authInitializedSubject.next(true);

      // Listen to auth changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        this.currentUserSubject.next(session?.user ?? null);
      });
    } catch (error) {
      console.error('Failed to initialize auth state:', error);
      this.currentUserSubject.next(null);
      this.isInitialized = true;

      // ✅ NEW: Still mark as initialized even on error
      this.authInitializedSubject.next(true);
    }
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

  async clearSession(): Promise<void> {
    try {
      await this.supabase.auth.signOut({ scope: 'local' });

      // Clear storage
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        console.warn('Could not clear storage:', error);
      }

      this.currentUserSubject.next(null);
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }
}
