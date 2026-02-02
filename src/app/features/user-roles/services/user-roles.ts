// src/app/features/user-roles/services/user-roles.service.ts
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserPermission, RoleTemplate, AVAILABLE_PERMISSIONS, Permission } from '../../../models/user-role.model';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth';

@Injectable({
  providedIn: 'root'
})
export class UserRolesService {
  constructor(
    private supabase: SupabaseService,
    private authService: AuthService
  ) {}

  // USERS
  getUsers(
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ data: any[], count: number }> {
    const churchId = this.authService.getChurchId();
    const offset = (page - 1) * pageSize;

    return from(
      (async () => {
        const { data, error, count } = await this.supabase.client
          .from('users')
          .select('*', { count: 'exact' })
          .eq('church_id', churchId)
          .order('full_name', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return { data: data || [], count: count || 0 };
      })()
    );
  }

  getUserById(userId: string): Observable<any> {
    return from(
      this.supabase.query<any>('users', {
        filters: { id: userId },
        limit: 1
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('User not found');
        return data[0];
      })
    );
  }

  // USER PERMISSIONS
  getUserPermissions(userId: string): Observable<UserPermission[]> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('user_permissions')
          .select('*')
          .eq('user_id', userId)
          .order('permission_name', { ascending: true });

        if (error) throw error;

        return data as UserPermission[];
      })()
    );
  }

  grantPermission(userId: string, permissionName: string): Observable<UserPermission> {
    const grantedBy = this.authService.getUserId();

    return from(
      this.supabase.insert<UserPermission>('user_permissions', {
        user_id: userId,
        permission_name: permissionName,
        granted_by: grantedBy
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  revokePermission(permissionId: string): Observable<void> {
    return from(
      this.supabase.delete('user_permissions', permissionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  bulkGrantPermissions(userId: string, permissionNames: string[]): Observable<void> {
    const grantedBy = this.authService.getUserId();

    return from(
      (async () => {
        // First, get existing permissions
        const { data: existing } = await this.supabase.client
          .from('user_permissions')
          .select('permission_name')
          .eq('user_id', userId);

        const existingPermissions = existing?.map(p => p.permission_name) || [];
        const newPermissions = permissionNames.filter(p => !existingPermissions.includes(p));

        if (newPermissions.length > 0) {
          const inserts = newPermissions.map(permissionName => ({
            user_id: userId,
            permission_name: permissionName,
            granted_by: grantedBy
          }));

          const { error } = await this.supabase.client
            .from('user_permissions')
            .insert(inserts);

          if (error) throw error;
        }
      })()
    );
  }

  bulkRevokePermissions(userId: string, permissionNames: string[]): Observable<void> {
    return from(
      (async () => {
        const { error } = await this.supabase.client
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .in('permission_name', permissionNames);

        if (error) throw error;
      })()
    );
  }

  // ROLE TEMPLATES
  getRoleTemplates(): Observable<RoleTemplate[]> {
    const churchId = this.authService.getChurchId();

    return from(
      (async () => {
        const { data, error } = await this.supabase.client
          .from('role_templates')
          .select('*')
          .eq('church_id', churchId)
          .order('role_name', { ascending: true });

        if (error) throw error;

        return data as RoleTemplate[];
      })()
    );
  }

  createRoleTemplate(templateData: Partial<RoleTemplate>): Observable<RoleTemplate> {
    const churchId = this.authService.getChurchId();

    return from(
      this.supabase.insert<RoleTemplate>('role_templates', {
        ...templateData,
        church_id: churchId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  updateRoleTemplate(templateId: string, templateData: Partial<RoleTemplate>): Observable<RoleTemplate> {
    return from(
      this.supabase.update<RoleTemplate>('role_templates', templateId, templateData)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data![0];
      })
    );
  }

  deleteRoleTemplate(templateId: string): Observable<void> {
    return from(
      this.supabase.delete('role_templates', templateId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  applyRoleTemplate(userId: string, templateId: string): Observable<void> {
    return from(
      (async () => {
        // Get template
        const { data: template } = await this.supabase.client
          .from('role_templates')
          .select('permissions')
          .eq('id', templateId)
          .single();

        if (!template) throw new Error('Role template not found');

        // Clear existing permissions
        await this.supabase.client
          .from('user_permissions')
          .delete()
          .eq('user_id', userId);

        // Apply new permissions
        if (template.permissions && template.permissions.length > 0) {
          await this.bulkGrantPermissions(userId, template.permissions).toPromise();
        }
      })()
    );
  }

  // UTILITY
  getAvailablePermissions(): Permission[] {
    return AVAILABLE_PERMISSIONS;
  }

  getPermissionsByCategory() {
    const grouped: Record<string, Permission[]> = {};

    AVAILABLE_PERMISSIONS.forEach(permission => {
      if (!grouped[permission.category]) {
        grouped[permission.category] = [];
      }
      grouped[permission.category].push(permission);
    });

    return grouped;
  }
}
