// src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import {
  map,
  catchError,
  tap,
  switchMap,
  retry,
  delay,
  filter,
  take,
} from 'rxjs/operators';
import {
  User,
  AuthResponse,
  SignUpData,
  SignupRequest,
  UserRole,
} from '../../models/user.model';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentProfileSubject = new BehaviorSubject<User | null>(null);
  public currentProfile$ = this.currentProfileSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private authReadySubject = new BehaviorSubject<boolean>(false);
  public authReady$ = this.authReadySubject.asObservable();

  private userRolesService?: any; // lazy loaded to avoid circular dep

  private churchFeaturesSubject = new BehaviorSubject<string[]>([]);
  churchFeatures$ = this.churchFeaturesSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private router: Router,
  ) {
    this.initializeAuth();
  }

  setUserRolesService(service: any): void {
    this.userRolesService = service;
  }

  // In auth.service.ts
  private initializeAuth() {
    this.supabase.authInitialized$
      .pipe(
        filter((initialized) => initialized),
        take(1),
        switchMap(() => this.supabase.currentUser$),
      )
      .subscribe(async (user) => {
        if (user) {
          await this.loadUserProfile(user.id);

          await this.loadChurchFeatures();

          // Load permissions on page refresh too
          if (this.userRolesService) {
            await this.userRolesService.loadCurrentUserPermissions();
          }
        } else {
          this.currentProfileSubject.next(null);
        }
        this.authReadySubject.next(true);
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

  // Add this method to your AuthService class
  getCurrentUserRole(): string {
    return this.currentProfile?.role || '';
  }
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

        const userProfile = profile[0];

        // Check approval status FIRST
        const approvalStatus = userProfile.approval_status || 'pending';

        if (approvalStatus === 'pending') {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Your account is pending admin approval. You will receive an email once approved.',
          );
        }

        if (approvalStatus === 'rejected') {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Your signup request was not approved. Please contact support for more information.',
          );
        }

        // Check active status
        if (!userProfile.is_active) {
          await this.supabase.client.auth.signOut();
          throw new Error('Your account is inactive. Please contact support.');
        }

        // Define admin roles that can bypass email verification
        const adminRoles: UserRole[] = ['super_admin', 'church_admin'];
        const isAdmin = adminRoles.includes(userProfile.role);

        // Check email verification - BYPASS for admins
        if (!isAdmin && !data.user?.email_confirmed_at) {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Please verify your email address before signing in. Check your inbox for the confirmation link.',
          );
        }

        // Set profile BEFORE loading permissions so hasRole() works correctly
        this.currentProfileSubject.next(userProfile);

        await this.loadChurchFeatures();

        // Load permissions for this user
        if (this.userRolesService) {
          await this.userRolesService.loadCurrentUserPermissions();
        }

        // Signal that auth + permissions are fully ready
        // This unblocks PermissionGuard and RoleGuard which wait on authReady$
        this.authReadySubject.next(true);

        return {
          user: userProfile,
          session: data.session,
        };
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        console.error('Sign in error:', error);
        return throwError(
          () => new Error(error.message || 'Failed to sign in'),
        );
      }),
    );
  }

  // Call this inside initializeAuth() and signIn()
  private async loadChurchFeatures(): Promise<void> {
    const churchId = this.getChurchId();
    if (!churchId) return;

    const { data, error } = await this.supabase.client
      .from('churches')
      .select('enabled_features')
      .eq('id', churchId)
      .single();

    if (!error && data) {
      this.churchFeaturesSubject.next(data.enabled_features || []);
    }
  }

  hasChurchFeature(feature: string): boolean {
    return this.churchFeaturesSubject.value.includes(feature);
  }

  /**
   * Handle member signup (joining existing church)
   */
  private async handleMemberSignup(
    data: any,
    signUpData: SignUpData,
  ): Promise<any> {
    // Check if a pre-created user record exists for this email in this church
    const { data: existingUser } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('email', signUpData.email)
      .eq('church_id', signUpData.church_id!)
      .neq('id', data.user.id)
      .maybeSingle(); // ← was .single()

    if (existingUser) {
      // Update the pre-created record to use the real auth UID
      await this.supabase.client
        .from('users')
        .update({ id: data.user.id, updated_at: new Date().toISOString() })
        .eq('email', signUpData.email)
        .eq('church_id', signUpData.church_id!);

      // ← ADD HERE: reconcile the members row that was created with a null user_id
      await this.supabase.client
        .from('members')
        .update({ user_id: data.user.id })
        .eq('email', signUpData.email)
        .is('user_id', null);
    }

    // Continue with normal member signup
    const result = await this.supabase.callFunction('create_member_signup', {
      p_user_id: data.user.id,
      p_full_name: signUpData.full_name,
      p_email: signUpData.email,
      p_phone: signUpData.phone,
      p_church_id: signUpData.church_id,
    });

    return {
      ...data,
      needsEmailConfirmation: !data.user.email_confirmed_at,
      pendingApproval: false,
      message: 'Welcome! Please check your email to confirm your account.',
    };
  }

  /**
   * Handle admin/pastor signup (creating new church or requesting access)
   */
  private async handleAdminSignup(
    data: any,
    signUpData: SignUpData,
  ): Promise<any> {
    // Determine role based on position
    const suggestedRole = this.mapPositionToRole(signUpData.position || '');

    // Create signup request record
    const { data: signupRequest, error: requestError } =
      await this.supabase.insert<SignupRequest>('signup_requests', {
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
      await this.supabase.invokeEdgeFunction('notify-admin-signup', {
        full_name: signUpData.full_name,
        email: signUpData.email,
        phone: signUpData.phone,
        church_name: signUpData.church_name,
        church_location: signUpData.church_location,
        position: signUpData.position,
        church_size: signUpData.church_size,
        how_heard: signUpData.how_heard,
        suggested_role: suggestedRole,
        request_id: signupRequest[0].id,
      });
    } catch (notifyError) {
      console.warn('Failed to send admin notification:', notifyError);
    }

    return {
      ...data,
      needsEmailConfirmation: !data.user.email_confirmed_at,
      pendingApproval: true,
      message:
        'Please check your email to confirm your account. After email confirmation, an administrator will review your signup request.',
    };
  }

  // Sign Up - With Approval System
  signUp(signUpData: SignUpData): Observable<any> {
    this.loadingSubject.next(true);

    return from(
      this.supabase.client.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/email-confirmed`,
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
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          // ✅ NEW: Handle member signup differently
          if (signUpData.signup_type === 'member' && signUpData.church_id) {
            return await this.handleMemberSignup(data, signUpData);
          } else {
            return await this.handleAdminSignup(data, signUpData);
          }
        } catch (postSignupError) {
          console.error('Post-signup process error:', postSignupError);
          return {
            ...data,
            needsEmailConfirmation: true,
            pendingApproval: signUpData.signup_type !== 'member',
            message:
              'Account created. Please check your email to confirm your account.',
          };
        }
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        console.error('Sign up error:', error);

        let errorMessage = 'Failed to sign up';

        if (
          error.message?.includes('User already registered') ||
          error.message?.includes('already been registered') ||
          error.code === '23505'
        ) {
          errorMessage =
            'This email is already registered. Please sign in instead or use "Recover password" if you forgot your password.';
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

  private mapPositionToRole(position: string): UserRole {
    const roleMap: Record<string, UserRole> = {
      senior_pastor: 'pastor',
      associate_pastor: 'pastor',
      church_administrator: 'church_admin',
      worship_leader: 'ministry_leader',
      youth_pastor: 'ministry_leader',
      elder: 'elder',
    };

    return roleMap[position] || 'member';
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
      }),
    );
  }

  // Sign Out
  async signOut(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
      this.currentProfileSubject.next(null);
      this.authReadySubject.next(false);
      if (this.userRolesService) {
        this.userRolesService.clearCurrentUserPermissions(); // ← clear on logout
      }
      this.router.navigate(['/auth/signin']);
    } catch (error) {
      console.error('Sign out error:', error);
      this.currentProfileSubject.next(null);
      this.authReadySubject.next(false); // ✅ reset on logout
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
        return throwError(
          () => new Error('Failed to send password reset email'),
        );
      }),
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
      }),
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
      }),
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
      }),
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

  async refreshProfile(): Promise<void> {
    const userId = this.getUserId();
    if (!userId) return;

    try {
      const { data, error } = await this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data) {
        this.currentProfileSubject.next(data);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
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
   * Get current user role
   */
  getUserRole(): UserRole | null {
    return this.currentProfile?.role || null;
  }

  /**
   * Get current user email
   */
  getUserEmail(): string | null {
    const user = this.getCurrentUser();
    return user?.email || null;
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
      }),
    ).pipe(
      catchError((error) => {
        console.error('Approve request error:', error);
        return throwError(() => new Error('Failed to approve signup request'));
      }),
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
      }),
    ).pipe(
      catchError((error) => {
        console.error('Reject request error:', error);
        return throwError(() => new Error('Failed to reject signup request'));
      }),
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
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError((error) => {
        console.error('Get signup requests error:', error);
        return throwError(() => new Error('Failed to load signup requests'));
      }),
    );
  }
}
