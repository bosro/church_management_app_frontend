// src/app/core/services/auth.service.ts
// KEY CHANGE: initializeAuth() now always awaits loadCurrentUserPermissions()
// before setting authReady = true. This ensures permissions are in memory
// before any guard evaluates them on a hard refresh or post-invite login.
import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, of, throwError } from 'rxjs';
import { map, catchError, tap, switchMap, filter, take } from 'rxjs/operators';
import {
  User,
  AuthResponse,
  SignUpData,
  SignupRequest,
  UserRole,
} from '../../models/user.model';
import { SupabaseService } from './supabase';
import { SubscriptionService } from './subscription.service';
import { UserRolesService } from '../../features/user-roles/services/user-roles';

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

  private userRolesService?: any;

  private churchFeaturesSubject = new BehaviorSubject<string[]>([]);
  churchFeatures$ = this.churchFeaturesSubject.asObservable();

  private subscriptionService?: any;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private injector: Injector,
  ) {
    this.initializeAuth();
  }

  setSubscriptionService(service: any): void {
    this.subscriptionService = service;
  }

  setUserRolesService(service: any): void {
    this.userRolesService = service;
  }

  private getUserRolesService(): UserRolesService {
    return this.injector.get(UserRolesService);
  }

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

          // Always load permissions on boot/refresh — guards depend on this
          await this.getUserRolesService().loadCurrentUserPermissions();

          if (this.subscriptionService) {
            this.subscriptionService.loadStatus();
          }
        } else {
          this.currentProfileSubject.next(null);
          // No user — mark permissions as "loaded" (empty set) so guards don't hang
          this.getUserRolesService().clearCurrentUserPermissions();
        }
        // Only set authReady AFTER permissions are in memory
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

        const { data: profile } = await this.supabase.query<User>('profiles', {
          filters: { id: data.user!.id },
          select: '*',
        });

        if (!profile || profile.length === 0) {
          throw new Error('Profile not found');
        }

        const userProfile = profile[0];
        const approvalStatus = userProfile.approval_status || 'pending';

        if (approvalStatus === 'pending') {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Please confirm your email address first. ' +
              'Check your inbox for a confirmation link. ' +
              'Once confirmed you can sign in immediately.',
          );
        }

        if (approvalStatus === 'rejected') {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Your signup request was not approved. Please contact support for more information.',
          );
        }

        if (!userProfile.is_active) {
          await this.supabase.client.auth.signOut();
          throw new Error('Your account is inactive. Please contact support.');
        }

        const adminRoles: UserRole[] = ['super_admin', 'church_admin'];
        const isAdmin = adminRoles.includes(userProfile.role);

        if (!isAdmin && !data.user?.email_confirmed_at) {
          await this.supabase.client.auth.signOut();
          throw new Error(
            'Please verify your email address before signing in. Check your inbox for the confirmation link.',
          );
        }

        // Set profile before loading permissions
        this.currentProfileSubject.next(userProfile);

        await this.loadChurchFeatures();

        // Load permissions and wait for them to fully resolve
        await this.getUserRolesService().loadCurrentUserPermissions();

        // Only mark auth as ready once permissions are in memory
        this.authReadySubject.next(true);

        if (this.subscriptionService) {
          this.subscriptionService.loadStatus();
        }

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

  private async handleMemberSignup(
    data: any,
    signUpData: SignUpData,
  ): Promise<any> {
    const result = await this.supabase.callFunction('create_member_signup', {
      p_user_id: data.user.id,
      p_full_name: signUpData.full_name,
      p_email: signUpData.email,
      p_phone: signUpData.phone,
      p_church_id: signUpData.church_id,
    });

    if (result.error) {
      console.error('create_member_signup error:', result.error);
    }

    return {
      ...data,
      needsEmailConfirmation: !data.user.email_confirmed_at,
      pendingApproval: false,
      message:
        'Account created! Please check your email and click the confirmation link to activate your account. You can sign in immediately after confirming.',
    };
  }

  getBranchId(): string | undefined {
    return this.currentProfile?.branch_id ?? undefined;
  }

  isBranchPastor(): boolean {
    const role = this.getCurrentUserRole();
    return role === 'pastor' && !!this.currentProfile?.branch_id;
  }

  isChurchAdmin(): boolean {
    const role = this.getCurrentUserRole();
    return role === 'church_admin' || role === 'super_admin';
  }

  private async handleAdminSignup(
    data: any,
    signUpData: SignUpData,
  ): Promise<any> {
    const suggestedRole = this.mapPositionToRole(signUpData.position || '');

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
      pendingApproval: false, // ← change to false
      message:
        'Please check your email to confirm your account. Once confirmed, you can sign in immediately!', // ← updated message
    };
  }

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

        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
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

  async signOut(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
      this.currentProfileSubject.next(null);
      this.authReadySubject.next(false);
      if (this.userRolesService) {
        this.userRolesService.clearCurrentUserPermissions();
      }
      if (this.subscriptionService) {
        this.subscriptionService.clearStatus();
      }
      this.router.navigate(['/auth/signin']);
    } catch (error) {
      console.error('Sign out error:', error);
      this.currentProfileSubject.next(null);
      this.authReadySubject.next(false);
      this.router.navigate(['/auth/signin']);
    }
  }

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

  hasRole(roles: string[]): boolean {
    const profile = this.currentProfile;
    return profile ? roles.includes(profile.role) : false;
  }

  isAdmin(): boolean {
    return this.hasRole(['super_admin', 'church_admin']);
  }

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

  getUserId(): string {
    const user = this.getCurrentUser();
    if (!user || !user.id) {
      throw new Error('No authenticated user');
    }
    return user.id;
  }

  getUserRole(): UserRole | null {
    return this.currentProfile?.role || null;
  }

  getUserEmail(): string | null {
    const user = this.getCurrentUser();
    return user?.email || null;
  }

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

  async clearAuthLock(): Promise<void> {
    try {
      await this.supabase.clearSession();
      window.location.reload();
    } catch (error) {
      console.error('Error clearing auth lock:', error);
    }
  }

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
