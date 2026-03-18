// src/app/core/services/permission.service.ts
import { Injectable } from '@angular/core';
import { UserRolesService } from '../../features/user-roles/services/user-roles';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  constructor(
    private userRolesService: UserRolesService,
    private authService: AuthService,
  ) {}

  // Core check — role OR permission
  can(permission: string): boolean {
    return this.userRolesService.hasPermission(permission);
  }

  private hasPermission(permission: string): boolean {
    return this.userRolesService.hasPermission(permission);
  }

  hasRole(roles: string | string[]): boolean {
    const userRole = this.authService.getCurrentUserRole();
    if (Array.isArray(roles)) {
      return roles.includes(userRole);
    }
    return userRole === roles;
  }

  // Convenience helpers per module
  get members() {
    return {
      view: this.can('members.view'),
      create: this.can('members.create'),
      edit: this.can('members.edit'),
      delete: this.can('members.delete'),
      export: this.can('members.export'),
      import: this.can('members.import'),
    };
  }

  get attendance() {
    return {
      view: this.can('attendance.view'),
      manage: this.can('attendance.manage'),
      checkin: this.can('attendance.checkin'),
      reports: this.can('attendance.reports'),
    };
  }

  get finance() {
    return {
      view: this.can('finance.view'),
      record: this.can('finance.record'),
      manage: this.can('finance.manage'),
      reports: this.can('finance.reports'),
      approve: this.can('finance.approve'),
    };
  }

  get ministries() {
    return {
      view: this.can('ministries.view'),
      manage: this.can('ministries.manage'),
      assign: this.can('ministries.assign'),
      leaders: this.can('ministries.leaders'),
    };
  }

  get events() {
    return {
      view: this.can('events.view'),
      create: this.can('events.create'),
      edit: this.can('events.edit'),
      delete: this.can('events.delete'),
      publish: this.can('events.publish'),
    };
  }

  get communications() {
    return {
      view: this.can('communications.view'),
      send: this.can('communications.send'),
      bulk: this.can('communications.bulk'),
      templates: this.can('communications.templates'),
    };
  }

  get forms() {
    return {
      view: this.can('forms.view'),
      manage: this.can('forms.manage'),
      submissions: this.can('forms.submissions'),
      delete: this.can('forms.delete'),
    };
  }

  get branches() {
    return {
      view: this.can('branches.view'),
      manage: this.can('branches.manage'),
      assign: this.can('branches.assign'),
    };
  }

  get sermons() {
    return {
      view: this.can('sermons.view'),
      upload: this.can('sermons.upload'),
      edit: this.can('sermons.edit'),
      delete: this.can('sermons.delete'),
    };
  }

  get settings() {
    return {
      view: this.can('settings.view'),
      manage: this.can('settings.manage'),
      integrations: this.can('settings.integrations'),
    };
  }

  get users() {
    return {
      view: this.can('users.view'),
      manage: this.can('users.manage'),
      permissions: this.can('users.permissions'),
      roles: this.can('users.roles'),
    };
  }

  // Check if current user is admin (bypasses all permission checks)
  get isAdmin(): boolean {
    const role = this.authService.getCurrentUserRole();
    return role === 'super_admin' || role === 'church_admin';
  }

  get reports() {
    return {
      view:
        this.authService.hasChurchFeature('reports') &&
        (this.isAdmin || this.hasPermission('reports.view')),
      manage:
        this.authService.hasChurchFeature('reports') &&
        (this.isAdmin || this.hasPermission('reports.manage')),
    };
  }

  get school() {
    const hasFeature = this.authService.hasChurchFeature('reports');
    return {
      view: hasFeature && (this.isAdmin || this.hasPermission('school.view')),
      manage:
        hasFeature && (this.isAdmin || this.hasPermission('school.manage')),
      fees: hasFeature && (this.isAdmin || this.hasPermission('school.fees')),
      exams: hasFeature && (this.isAdmin || this.hasPermission('school.exams')),
      receipts:
        hasFeature && (this.isAdmin || this.hasPermission('school.receipts')),
    };
  }
}
