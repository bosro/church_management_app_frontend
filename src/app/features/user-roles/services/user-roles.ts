// src/app/features/user-roles/services/user-roles.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  UserPermission,
  RoleTemplate,
  AVAILABLE_PERMISSIONS,
  Permission,
  PermissionCategory,
  UserListResult,
  RoleTemplateCreateInput,
  RoleTemplateUpdateInput,
} from '../../../models/user-role.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';
import { SubscriptionService } from '../../../core/services/subscription.service';

@Injectable({
  providedIn: 'root',
})
export class UserRolesService {
  private currentUserPermissions: Set<string> = new Set();

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
  ) {
    this.authService.setUserRolesService(this);
  }

  // Get churchId dynamically instead of storing it
  private getChurchId(): string {
    const churchId = this.authService.getChurchId();
    if (!churchId) {
      throw new Error('Church ID not found. Please ensure you are logged in.');
    }
    return churchId;
  }

  // Get current user ID dynamically
  private getCurrentUserId(): string {
    try {
      return this.authService.getUserId();
    } catch (error) {
      throw new Error('User ID not found. Please ensure you are logged in.');
    }
  }

  async loadCurrentUserPermissions(): Promise<void> {
    try {
      const userId = this.getCurrentUserId();
      const { data, error } = await this.supabase.client
        .from('user_permissions')
        .select('permission_name')
        .eq('user_id', userId);

      if (!error && data) {
        this.currentUserPermissions = new Set(
          data.map((p: any) => p.permission_name),
        );
      }
    } catch {
      this.currentUserPermissions = new Set();
    }
  }

  clearCurrentUserPermissions(): void {
    this.currentUserPermissions = new Set();
  }

  hasPermission(permissionName: string): boolean {
    // Admins always have all permissions
    if (this.authService.hasRole(['super_admin', 'church_admin'])) return true;
    return this.currentUserPermissions.has(permissionName);
  }

  // ==================== USERS ====================

  getUsers(
    page: number = 1,
    pageSize: number = 20,
  ): Observable<UserListResult> {
    return from(this.fetchUsers(page, pageSize));
  }

  private async fetchUsers(
    page: number,
    pageSize: number,
  ): Promise<UserListResult> {
    const churchId = this.getChurchId(); // Get fresh churchId
    const offset = (page - 1) * pageSize;

    const { data, error, count } = await this.supabase.client
      .from('users')
      .select('*', { count: 'exact' })
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 0;

    return {
      data: data || [],
      count: count || 0,
      page,
      pageSize,
      totalPages,
    };
  }

  getUserById(userId: string): Observable<any> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('User not found');
        return data;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  /**
   * Permanently delete a sub-user profile and all their permissions.
   * Only church_admin can do this, and only for users in their church.
   */
  deleteUser(userId: string): Observable<void> {
    return from(this.deleteUserAndPermissions(userId));
  }

  private async deleteUserAndPermissions(userId: string): Promise<void> {
    const requestingUserId = this.getCurrentUserId();

    // Step 1: Call secure DB function — handles users, profiles,
    // permissions, member links, branch pastor assignments
    const { error: deleteError } = await this.supabase.client.rpc(
      'delete_church_user',
      {
        p_user_id: userId,
        p_requesting_user_id: requestingUserId,
      },
    );

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Step 2: Delete from Supabase Auth via edge function
    // Best-effort — DB is already clean even if this fails
    try {
      const { error: authDeleteError } =
        await this.supabase.client.functions.invoke('delete-auth-user', {
          body: { user_id: userId },
        });

      if (authDeleteError) {
        console.warn('Auth user deletion warning:', authDeleteError.message);
      }
    } catch (err) {
      console.warn('Could not delete auth user (non-critical):', err);
    }
  }

  updateUserRole(userId: string, newRole: string): Observable<void> {
    return from(
      this.supabase.client.rpc('update_user_role', {
        p_user_id: userId,
        p_new_role: newRole,
        p_church_id: this.getChurchId(),
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

 getAssignableRoles(): { value: string; label: string }[] {
  return [
    { value: 'church_admin',    label: 'Church Admin' },
    { value: 'pastor',          label: 'Pastor' },
    { value: 'senior_pastor',   label: 'Senior Pastor' },
    { value: 'associate_pastor',label: 'Associate Pastor' },
    { value: 'finance_officer', label: 'Finance Officer' },
    { value: 'ministry_leader', label: 'Ministry Leader' },
    { value: 'group_leader',    label: 'Group Leader' },
    { value: 'cell_leader',     label: 'Cell Leader' },   // ← NEW
    { value: 'elder',           label: 'Elder' },
    { value: 'deacon',          label: 'Deacon' },
    { value: 'worship_leader',  label: 'Worship Leader' },
    { value: 'member',          label: 'Member' },
  ];
}

  deactivateUser(userId: string): Observable<void> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== USER PERMISSIONS ====================

  getUserPermissions(userId: string): Observable<UserPermission[]> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId)
        .order('permission_name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as UserPermission[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  inviteUser(userData: {
    full_name: string;
    email: string;
    phone_number: string | null;
    role: string;
  }): Observable<any> {
    return from(this.sendInvite(userData));
  }

  private async sendInvite(userData: {
    full_name: string;
    email: string;
    phone_number: string | null;
    role: string;
  }): Promise<any> {
    const churchId = this.getChurchId();

    // Step 1: Send Supabase invite email
    // This creates the auth.users record and sends a magic link
    const { data, error } =
      await this.supabase.client.auth.admin.inviteUserByEmail(userData.email, {
        data: {
          full_name: userData.full_name,
          role: userData.role,
          church_id: churchId,
          phone_number: userData.phone_number,
        },
      });

    if (error) throw new Error(error.message);
    return data;
  }

  grantPermission(
    userId: string,
    permissionName: string,
  ): Observable<UserPermission> {
    return from(this.insertPermission(userId, permissionName));
  }

  private async insertPermission(
    userId: string,
    permissionName: string,
  ): Promise<UserPermission> {
    const currentUserId = this.getCurrentUserId(); // Get fresh userId

    // Use maybeSingle() instead of single() — returns null instead of error when no rows found
    const { data: existing } = await this.supabase.client
      .from('user_permissions')
      .select('id')
      .eq('user_id', userId)
      .eq('permission_name', permissionName)
      .maybeSingle();

    if (existing) {
      throw new Error('Permission already granted');
    }

    const { data, error } = await this.supabase.client
      .from('user_permissions')
      .insert({
        user_id: userId,
        permission_name: permissionName,
        granted_by: currentUserId,
        granted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as UserPermission;
  }

  createUser(userData: {
    full_name: string;
    email: string;
    phone_number: string | null;
    role: string;
  }): Observable<any> {
    return this.subscriptionService.checkQuota('users').pipe(
      switchMap((quota) => {
        if (!quota.allowed) {
          return throwError(
            () =>
              new Error(`QUOTA_EXCEEDED:users:${quota.current}:${quota.limit}`),
          );
        }

        // Get session first, then invoke
        return from(
          this.supabase.client.auth
            .getSession()
            .then(({ data: { session } }) => {
              if (!session?.access_token) {
                throw new Error('No active session. Please log in again.');
              }

              return this.supabase.client.functions.invoke('invite-user', {
                body: {
                  email: userData.email,
                  full_name: userData.full_name,
                  role: userData.role,
                  church_id: this.authService.getChurchId(),
                  phone_number: userData.phone_number,
                },
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });
            }),
        );
      }),
      map(({ data, error }: any) => {
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        return data;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  private async inviteAndCreateUser(userData: {
    full_name: string;
    email: string;
    phone_number: string | null;
    role: string;
  }): Promise<any> {
    const churchId = this.getChurchId(); // Get fresh churchId

    // Step 1: Invite user via Supabase Auth — creates the auth.users record
    const { data: authData, error: authError } =
      await this.supabase.client.auth.admin.inviteUserByEmail(userData.email, {
        data: {
          full_name: userData.full_name,
          role: userData.role,
        },
      });

    if (authError) throw new Error(authError.message);

    const authUserId = authData.user.id;

    // Step 2: Insert the profile row using the auth user's ID
    const { data, error } = await this.supabase.client
      .from('users')
      .insert({
        id: authUserId,
        full_name: userData.full_name,
        email: userData.email,
        phone_number: userData.phone_number,
        role: userData.role,
        church_id: churchId,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  revokePermission(permissionId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .delete()
        .eq('id', permissionId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  bulkGrantPermissions(
    userId: string,
    permissionNames: string[],
  ): Observable<void> {
    return from(this.insertBulkPermissions(userId, permissionNames));
  }

  private async insertBulkPermissions(
    userId: string,
    permissionNames: string[],
  ): Promise<void> {
    const currentUserId = this.getCurrentUserId(); // Get fresh userId

    // Get existing permissions
    const { data: existing } = await this.supabase.client
      .from('user_permissions')
      .select('permission_name')
      .eq('user_id', userId);

    const existingPermissions = existing?.map((p) => p.permission_name) || [];
    const newPermissions = permissionNames.filter(
      (p) => !existingPermissions.includes(p),
    );

    if (newPermissions.length === 0) {
      return; // All permissions already granted
    }

    const inserts = newPermissions.map((permissionName) => ({
      user_id: userId,
      permission_name: permissionName,
      granted_by: currentUserId,
      granted_at: new Date().toISOString(),
    }));

    const { error } = await this.supabase.client
      .from('user_permissions')
      .insert(inserts);

    if (error) {
      throw new Error(error.message);
    }
  }

  bulkRevokePermissions(
    userId: string,
    permissionNames: string[],
  ): Observable<void> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .in('permission_name', permissionNames),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  // ==================== ROLE TEMPLATES ====================

  getRoleTemplates(): Observable<RoleTemplate[]> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('role_templates')
        .select('*')
        .eq('church_id', churchId)
        .order('role_name', { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as RoleTemplate[];
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  getRoleTemplateById(templateId: string): Observable<RoleTemplate> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('role_templates')
        .select('*')
        .eq('id', templateId)
        .eq('church_id', churchId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Role template not found');
        return data as RoleTemplate;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  createRoleTemplate(
    templateData: RoleTemplateCreateInput,
  ): Observable<RoleTemplate> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('role_templates')
        .insert({
          ...templateData,
          church_id: churchId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as RoleTemplate;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  updateRoleTemplate(
    templateId: string,
    templateData: RoleTemplateUpdateInput,
  ): Observable<RoleTemplate> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('role_templates')
        .update({
          ...templateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)
        .eq('church_id', churchId)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as RoleTemplate;
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  deleteRoleTemplate(templateId: string): Observable<void> {
    const churchId = this.getChurchId(); // Get fresh churchId

    return from(
      this.supabase.client
        .from('role_templates')
        .delete()
        .eq('id', templateId)
        .eq('church_id', churchId),
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  applyRoleTemplate(userId: string, templateId: string): Observable<void> {
    return from(this.applyTemplate(userId, templateId));
  }

  private async applyTemplate(
    userId: string,
    templateId: string,
  ): Promise<void> {
    const churchId = this.getChurchId(); // Get fresh churchId

    // Get template
    const { data: template, error: templateError } = await this.supabase.client
      .from('role_templates')
      .select('permissions')
      .eq('id', templateId)
      .eq('church_id', churchId)
      .single();

    if (templateError) {
      throw new Error(templateError.message);
    }

    if (!template) {
      throw new Error('Role template not found');
    }

    // Clear existing permissions
    const { error: deleteError } = await this.supabase.client
      .from('user_permissions')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    // Apply new permissions
    if (template.permissions && template.permissions.length > 0) {
      await this.insertBulkPermissions(userId, template.permissions);
    }
  }

  // ==================== UTILITY ====================

  getAvailablePermissions(): Permission[] {
    return AVAILABLE_PERMISSIONS;
  }

  getPermissionsByCategory(): Record<string, Permission[]> {
    const grouped: Record<string, Permission[]> = {};

    AVAILABLE_PERMISSIONS.forEach((permission) => {
      if (!grouped[permission.category]) {
        grouped[permission.category] = [];
      }
      grouped[permission.category].push(permission);
    });

    return grouped;
  }

  getPermissionsByNames(names: string[]): Permission[] {
    return AVAILABLE_PERMISSIONS.filter((p) => names.includes(p.name));
  }

  validatePermissions(permissions: string[]): boolean {
    const validNames = AVAILABLE_PERMISSIONS.map((p) => p.name);
    return permissions.every((p) => validNames.includes(p));
  }

  // Check if current user has permission to manage roles
  canManageRoles(): boolean {
    const adminRoles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(adminRoles);
  }

  // Check if current user has permission to manage permissions
  canManagePermissions(): boolean {
    const adminRoles = ['super_admin', 'church_admin'];
    return this.authService.hasRole(adminRoles);
  }
}
