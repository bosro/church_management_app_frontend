// src/app/features/user-roles/services/user-roles.service.ts
import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  UserPermission,
  RoleTemplate,
  AVAILABLE_PERMISSIONS,
  Permission,
  PermissionCategory,
  UserListResult,
  RoleTemplateCreateInput,
  RoleTemplateUpdateInput
} from '../../../models/user-role.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class UserRolesService {
  private churchId?: string;
  private currentUserId?: string;

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {
    this.churchId = this.authService.getChurchId();
    this.currentUserId = this.authService.getUserId();
  }

  // ==================== USERS ====================

  getUsers(
    page: number = 1,
    pageSize: number = 20
  ): Observable<UserListResult> {
    return from(this.fetchUsers(page, pageSize));
  }

  private async fetchUsers(
    page: number,
    pageSize: number
  ): Promise<UserListResult> {
    const offset = (page - 1) * pageSize;

    const { data, error, count } = await this.supabase.client
      .from('users')
      .select('*', { count: 'exact' })
      .eq('church_id', this.churchId)
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
      totalPages
    };
  }

  getUserById(userId: string): Observable<any> {
    return from(
      this.supabase.client
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('User not found');
        return data;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateUserRole(userId: string, role: string): Observable<any> {
    return from(
      this.supabase.client
        .from('users')
        .update({
          role,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
      catchError(err => throwError(() => err))
    );
  }

  deactivateUser(userId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== USER PERMISSIONS ====================

  getUserPermissions(userId: string): Observable<UserPermission[]> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId)
        .order('permission_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as UserPermission[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  grantPermission(userId: string, permissionName: string): Observable<UserPermission> {
    return from(this.insertPermission(userId, permissionName));
  }

  private async insertPermission(
    userId: string,
    permissionName: string
  ): Promise<UserPermission> {
    // Check if permission already exists
    const { data: existing } = await this.supabase.client
      .from('user_permissions')
      .select('id')
      .eq('user_id', userId)
      .eq('permission_name', permissionName)
      .single();

    if (existing) {
      throw new Error('Permission already granted');
    }

    const { data, error } = await this.supabase.client
      .from('user_permissions')
      .insert({
        user_id: userId,
        permission_name: permissionName,
        granted_by: this.currentUserId,
        granted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as UserPermission;
  }

  revokePermission(permissionId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .delete()
        .eq('id', permissionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  bulkGrantPermissions(userId: string, permissionNames: string[]): Observable<void> {
    return from(this.insertBulkPermissions(userId, permissionNames));
  }

  private async insertBulkPermissions(
    userId: string,
    permissionNames: string[]
  ): Promise<void> {
    // Get existing permissions
    const { data: existing } = await this.supabase.client
      .from('user_permissions')
      .select('permission_name')
      .eq('user_id', userId);

    const existingPermissions = existing?.map(p => p.permission_name) || [];
    const newPermissions = permissionNames.filter(p => !existingPermissions.includes(p));

    if (newPermissions.length === 0) {
      return; // All permissions already granted
    }

    const inserts = newPermissions.map(permissionName => ({
      user_id: userId,
      permission_name: permissionName,
      granted_by: this.currentUserId,
      granted_at: new Date().toISOString()
    }));

    const { error } = await this.supabase.client
      .from('user_permissions')
      .insert(inserts);

    if (error) {
      throw new Error(error.message);
    }
  }

  bulkRevokePermissions(userId: string, permissionNames: string[]): Observable<void> {
    return from(
      this.supabase.client
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .in('permission_name', permissionNames)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ==================== ROLE TEMPLATES ====================

  getRoleTemplates(): Observable<RoleTemplate[]> {
    return from(
      this.supabase.client
        .from('role_templates')
        .select('*')
        .eq('church_id', this.churchId)
        .order('role_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data || []) as RoleTemplate[];
      }),
      catchError(err => throwError(() => err))
    );
  }

  getRoleTemplateById(templateId: string): Observable<RoleTemplate> {
    return from(
      this.supabase.client
        .from('role_templates')
        .select('*')
        .eq('id', templateId)
        .eq('church_id', this.churchId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Role template not found');
        return data as RoleTemplate;
      }),
      catchError(err => throwError(() => err))
    );
  }

  createRoleTemplate(templateData: RoleTemplateCreateInput): Observable<RoleTemplate> {
    return from(
      this.supabase.client
        .from('role_templates')
        .insert({
          ...templateData,
          church_id: this.churchId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as RoleTemplate;
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateRoleTemplate(
    templateId: string,
    templateData: RoleTemplateUpdateInput
  ): Observable<RoleTemplate> {
    return from(
      this.supabase.client
        .from('role_templates')
        .update({
          ...templateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .eq('church_id', this.churchId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as RoleTemplate;
      }),
      catchError(err => throwError(() => err))
    );
  }

  deleteRoleTemplate(templateId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('role_templates')
        .delete()
        .eq('id', templateId)
        .eq('church_id', this.churchId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      }),
      catchError(err => throwError(() => err))
    );
  }

  applyRoleTemplate(userId: string, templateId: string): Observable<void> {
    return from(this.applyTemplate(userId, templateId));
  }

  private async applyTemplate(userId: string, templateId: string): Promise<void> {
    // Get template
    const { data: template, error: templateError } = await this.supabase.client
      .from('role_templates')
      .select('permissions')
      .eq('id', templateId)
      .eq('church_id', this.churchId)
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

    AVAILABLE_PERMISSIONS.forEach(permission => {
      if (!grouped[permission.category]) {
        grouped[permission.category] = [];
      }
      grouped[permission.category].push(permission);
    });

    return grouped;
  }

  getPermissionsByNames(names: string[]): Permission[] {
    return AVAILABLE_PERMISSIONS.filter(p => names.includes(p.name));
  }

  validatePermissions(permissions: string[]): boolean {
    const validNames = AVAILABLE_PERMISSIONS.map(p => p.name);
    return permissions.every(p => validNames.includes(p));
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
