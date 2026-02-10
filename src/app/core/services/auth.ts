// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { map, catchError, tap, switchMap, retry, delay } from 'rxjs/operators';
import { User, AuthResponse, SignUpData } from '../../models/user.model';
import { SupabaseService } from './supabase';
import { Church } from '../../models/church.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentProfileSubject = new BehaviorSubject<User | null>(null);
  public currentProfile$ = this.currentProfileSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private router: Router,
  ) {
    this.initializeAuth();
  }

  private initializeAuth() {
    this.supabase.currentUser$.subscribe(async (user) => {
      if (user) {
        await this.loadUserProfile(user.id);
      } else {
        this.currentProfileSubject.next(null);
      }
    });
  }

  private async loadUserProfile(userId: string) {
    try {
      const { data, error } = await this.supabase.query<User>('profiles', {
        filters: { id: userId },
        select: '*',
      });

      if (error) {
        console.error('Error loading user profile:', error);
        return;
      }

      if (data && data.length > 0) {
        this.currentProfileSubject.next(data[0]);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  }

  get currentProfile(): User | null {
    return this.currentProfileSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.supabase.currentUser;
  }

  // Sign In with Email & Password
  signIn(email: string, password: string): Observable<AuthResponse> {
    this.loadingSubject.next(true);

    return from(
      this.supabase.client.auth.signInWithPassword({ email, password }),
    ).pipe(
      switchMap(async ({ data, error }) => {
        if (error) throw error;

        // Load profile
        const { data: profile } = await this.supabase.query<User>('profiles', {
          filters: { id: data.user!.id },
          select: '*',
        });

        return {
          user: profile![0],
          session: data.session,
        };
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        console.error('Sign in error:', error);
        return throwError(() => new Error(error.message || 'Failed to sign in'));
      }),
    );
  }

  // Sign Up
  signUp(signUpData: SignUpData): Observable<any> {
    this.loadingSubject.next(true);

    return from(
      this.supabase.client.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          data: {
            full_name: signUpData.full_name,
            role: 'church_admin', // First user becomes admin
          },
        },
      }),
    ).pipe(
      switchMap(async ({ data, error }) => {
        if (error) throw error;

        // Create church
        const churchSlug = signUpData.church_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const { data: church, error: churchError } =
          await this.supabase.insert<Church>('churches', {
            name: signUpData.church_name,
            slug: churchSlug,
            city: signUpData.church_location,
            country: 'Ghana',
            primary_color: '#5B21B6',
            secondary_color: '#DB2777',
            timezone: 'Africa/Accra',
            currency: 'GHS',
            is_active: true,
            subscription_tier: 'free',
          });

        if (churchError) throw churchError;

        // Update profile with church_id
        if (data.user) {
          await this.supabase.update('profiles', data.user.id, {
            church_id: church![0].id,
            phone_number: signUpData.phone,
            role: 'church_admin',
          });

          // Create default giving categories
          await this.supabase.callFunction('create_default_giving_categories', {
            church_uuid: church![0].id,
          });
        }

        return data;
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        console.error('Sign up error:', error);
        return throwError(() => new Error(error.message || 'Failed to sign up'));
      }),
    );
  }

  // Sign In with Google
  signInWithGoogle(): Observable<any> {
    return from(
      this.supabase.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      }),
    ).pipe(
      catchError((error) => {
        console.error('Google sign in error:', error);
        return throwError(() => new Error('Failed to sign in with Google'));
      })
    );
  }

  // Sign Out
  async signOut(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
      this.currentProfileSubject.next(null);
      this.router.navigate(['/auth/signin']);
    } catch (error) {
      console.error('Sign out error:', error);
      // Force navigation even if signOut fails
      this.currentProfileSubject.next(null);
      this.router.navigate(['/auth/signin']);
    }
  }

  // Forgot Password
  sendPasswordResetEmail(email: string): Observable<any> {
    return from(
      this.supabase.client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }),
    ).pipe(
      catchError((error) => {
        console.error('Password reset error:', error);
        return throwError(() => new Error('Failed to send password reset email'));
      })
    );
  }

  // Update Password
  updatePassword(newPassword: string): Observable<any> {
    return from(
      this.supabase.client.auth.updateUser({
        password: newPassword,
      }),
    ).pipe(
      catchError((error) => {
        console.error('Password update error:', error);
        return throwError(() => new Error('Failed to update password'));
      })
    );
  }

  // Verify OTP
  verifyOTP(email: string, token: string): Observable<any> {
    return from(
      this.supabase.client.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      }),
    ).pipe(
      catchError((error) => {
        console.error('OTP verification error:', error);
        return throwError(() => new Error('Failed to verify OTP'));
      })
    );
  }

  // Resend OTP
  resendOTP(email: string): Observable<any> {
    return from(
      this.supabase.client.auth.resend({
        type: 'signup',
        email,
      }),
    ).pipe(
      catchError((error) => {
        console.error('Resend OTP error:', error);
        return throwError(() => new Error('Failed to resend OTP'));
      })
    );
  }

  // Check if user has role
  hasRole(roles: string[]): boolean {
    const profile = this.currentProfile;
    return profile ? roles.includes(profile.role) : false;
  }

  // Check if user is admin
  isAdmin(): boolean {
    return this.hasRole(['super_admin', 'church_admin']);
  }

  // Get user's church ID
  getChurchId(): string | undefined {
    return this.currentProfile?.church_id;
  }

  getCurrentUser() {
    return this.supabase.currentUser;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    const user = this.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('No authenticated user');
    }
    return user.id;
  }

  /**
   * Reset password - send password reset email
   */
  resetPassword(email: string): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/auth/reset-password`,
          },
        );

        if (error) throw error;
      })(),
    ).pipe(
      catchError((error) => {
        console.error('Password reset error:', error);
        return throwError(
          () =>
            new Error(error.message || 'Failed to send password reset email'),
        );
      }),
    );
  }

  /**
   * Clear auth lock and session issues
   */
  async clearAuthLock(): Promise<void> {
    try {
      await this.supabase.clearSession();
      // Clear any stuck locks by reloading
      window.location.reload();
    } catch (error) {
      console.error('Error clearing auth lock:', error);
    }
  }
}
