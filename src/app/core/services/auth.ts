// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { map, catchError, tap, switchMap, retry, delay, filter, take } from 'rxjs/operators';
import { User, AuthResponse, SignUpData, SignupRequest } from '../../models/user.model';
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

  // In auth.service.ts
private initializeAuth() {
  // ✅ Wait for Supabase auth to initialize first
  this.supabase.authInitialized$.pipe(
    filter(initialized => initialized),
    take(1),
    switchMap(() => this.supabase.currentUser$)
  ).subscribe(async (user) => {
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

        if (!profile || profile.length === 0) {
          throw new Error('Profile not found');
        }

        // Check approval status - with null/undefined safety
        const approvalStatus = profile[0].approval_status || 'pending';

        if (approvalStatus === 'pending') {
          // Sign out the user
          await this.supabase.client.auth.signOut();
          throw new Error('Your account is pending admin approval. Please wait for approval email.');
        }

        if (approvalStatus === 'rejected') {
          await this.supabase.client.auth.signOut();
          throw new Error('Your signup request was not approved. Please contact support.');
        }

        if (!profile[0].is_active) {
          await this.supabase.client.auth.signOut();
          throw new Error('Your account is inactive. Please contact support.');
        }

        return {
          user: profile[0],
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

  // Sign Up - With Approval System
  signUp(signUpData: SignUpData): Observable<any> {
    this.loadingSubject.next(true);

    return from(
      this.supabase.client.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: signUpData.full_name,
          },
        },
      }),
    ).pipe(
      switchMap(async ({ data, error }) => {
        if (error) {
          console.error('Auth signup error:', error);
          throw error;
        }

        if (!data.user) {
          throw new Error('User creation failed');
        }

        console.log('User created successfully:', data.user.id);

        // Wait for profile creation trigger
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          // Create signup request record with proper typing
          const { data: signupRequest, error: requestError } = await this.supabase.insert<SignupRequest>('signup_requests', {
            user_id: data.user.id,
            full_name: signUpData.full_name,
            email: signUpData.email,
            phone: signUpData.phone,
            position: signUpData.position,
            church_name: signUpData.church_name,
            church_location: signUpData.church_location,
            church_size: signUpData.church_size,
            how_heard: signUpData.how_heard,
            status: 'pending',
          });

          if (requestError) {
            console.error('Signup request creation error:', requestError);
            throw requestError;
          }

          if (!signupRequest || signupRequest.length === 0) {
            throw new Error('Failed to create signup request');
          }

          console.log('Signup request created:', signupRequest[0]);

          // Send notification to admins via edge function
          try {
            const { data: notifyData, error: notifyError } = await this.supabase.invokeEdgeFunction('notify-admin-signup', {
              full_name: signUpData.full_name,
              email: signUpData.email,
              phone: signUpData.phone,
              church_name: signUpData.church_name,
              church_location: signUpData.church_location,
              position: signUpData.position,
              church_size: signUpData.church_size,
              how_heard: signUpData.how_heard,
              request_id: signupRequest[0].id,
            });

            if (notifyError) {
              console.warn('Failed to send admin notification:', notifyError);
            } else {
              console.log('Admin notification sent:', notifyData);
            }
          } catch (notifyError) {
            console.warn('Failed to send admin notification:', notifyError);
            // Don't throw - signup still succeeded
          }

          return {
            ...data,
            pendingApproval: true,
            message: 'Signup request submitted. An admin will review your request and you will receive an email notification.'
          };

        } catch (postSignupError) {
          console.error('Post-signup process error:', postSignupError);
          return {
            ...data,
            pendingApproval: true,
            message: 'Account created. Awaiting admin approval.'
          };
        }
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        console.error('Sign up error:', error);

        let errorMessage = 'Failed to sign up';

        if (error.message?.includes('User already registered')) {
          errorMessage = 'This email is already registered';
        } else if (error.message?.includes('Database error')) {
          errorMessage = 'Registration error. Please try again.';
        } else if (error.message?.includes('Invalid email')) {
          errorMessage = 'Please provide a valid email address';
        } else if (error.message) {
          errorMessage = error.message;
        }

        return throwError(() => new Error(errorMessage));
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

  /**
   * Admin: Approve signup request
   */
  approveSignupRequest(requestId: string, churchId?: string): Observable<any> {
    return from(
      this.supabase.callFunction('approve_signup_request', {
        request_id: requestId,
        admin_id: this.getUserId(),
        assign_church_id: churchId || null,
      })
    ).pipe(
      catchError((error) => {
        console.error('Approve request error:', error);
        return throwError(() => new Error('Failed to approve signup request'));
      })
    );
  }

  /**
   * Admin: Reject signup request
   */
  rejectSignupRequest(requestId: string, reason?: string): Observable<any> {
    return from(
      this.supabase.callFunction('reject_signup_request', {
        request_id: requestId,
        admin_id: this.getUserId(),
        reason: reason || null,
      })
    ).pipe(
      catchError((error) => {
        console.error('Reject request error:', error);
        return throwError(() => new Error('Failed to reject signup request'));
      })
    );
  }

  /**
   * Admin: Get pending signup requests
   */
  getPendingSignupRequests(): Observable<SignupRequest[]> {
    return from(
      this.supabase.query<SignupRequest>('signup_requests', {
        filters: { status: 'pending' },
        select: '*',
        order: { column: 'created_at', ascending: false },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError((error) => {
        console.error('Get signup requests error:', error);
        return throwError(() => new Error('Failed to load signup requests'));
      })
    );
  }
}
