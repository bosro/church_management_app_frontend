// src/app/models/user-role.model.ts
export interface UserPermission {
  id: string;
  user_id: string;
  permission_name: string;
  granted_by: string;
  granted_at: string;

  // Relations
  user?: any;
  granted_by_user?: any;
}

export interface RoleTemplate {
  id: string;
  church_id: string;
  role_name: string;
  permissions: string[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export type PermissionCategory =
  | 'members'
  | 'attendance'
  | 'finance'
  | 'ministries'
  | 'events'
  | 'communications'
  | 'forms'
  | 'branches'
  | 'sermons'
  | 'settings'
  | 'users';

export interface Permission {
  name: string;
  label: string;
  category: PermissionCategory;
  description: string;
}

export interface RoleTemplateCreateInput {
  role_name: string;
  permissions: string[];
  description?: string;
}

export interface RoleTemplateUpdateInput {
  role_name?: string;
  permissions: string[];
  description?: string;
}

export interface UserListResult {
  data: any[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Available Permissions
export const AVAILABLE_PERMISSIONS: Permission[] = [
  // Members
  { name: 'members.view', label: 'View Members', category: 'members', description: 'View member information and profiles' },
  { name: 'members.create', label: 'Create Members', category: 'members', description: 'Add new members to the database' },
  { name: 'members.edit', label: 'Edit Members', category: 'members', description: 'Modify member information' },
  { name: 'members.delete', label: 'Delete Members', category: 'members', description: 'Remove members from the database' },
  { name: 'members.export', label: 'Export Members', category: 'members', description: 'Export member data to CSV/Excel' },
  { name: 'members.import', label: 'Import Members', category: 'members', description: 'Import members from CSV files' },

  // Attendance
  { name: 'attendance.view', label: 'View Attendance', category: 'attendance', description: 'View attendance records and reports' },
  { name: 'attendance.manage', label: 'Manage Attendance', category: 'attendance', description: 'Create and edit attendance events' },
  { name: 'attendance.checkin', label: 'Check-in Members', category: 'attendance', description: 'Check-in members to services and events' },
  { name: 'attendance.reports', label: 'Attendance Reports', category: 'attendance', description: 'Generate and view attendance reports' },

  // Finance
  { name: 'finance.view', label: 'View Finance', category: 'finance', description: 'View financial records and transactions' },
  { name: 'finance.record', label: 'Record Giving', category: 'finance', description: 'Record donations, tithes, and offerings' },
  { name: 'finance.manage', label: 'Manage Finance', category: 'finance', description: 'Full financial management access' },
  { name: 'finance.reports', label: 'Financial Reports', category: 'finance', description: 'View and generate financial reports' },
  { name: 'finance.approve', label: 'Approve Transactions', category: 'finance', description: 'Approve financial transactions' },

  // Ministries
  { name: 'ministries.view', label: 'View Ministries', category: 'ministries', description: 'View ministry information and members' },
  { name: 'ministries.manage', label: 'Manage Ministries', category: 'ministries', description: 'Create, edit, and delete ministries' },
  { name: 'ministries.assign', label: 'Assign Members', category: 'ministries', description: 'Assign and remove members from ministries' },
  { name: 'ministries.leaders', label: 'Manage Leaders', category: 'ministries', description: 'Assign and remove ministry leaders' },

  // Events
  { name: 'events.view', label: 'View Events', category: 'events', description: 'View all church events' },
  { name: 'events.create', label: 'Create Events', category: 'events', description: 'Create new events and programs' },
  { name: 'events.edit', label: 'Edit Events', category: 'events', description: 'Modify event information' },
  { name: 'events.delete', label: 'Delete Events', category: 'events', description: 'Remove events from calendar' },
  { name: 'events.publish', label: 'Publish Events', category: 'events', description: 'Publish events to public calendar' },

  // Communications
  { name: 'communications.view', label: 'View Communications', category: 'communications', description: 'View sent messages and campaigns' },
  { name: 'communications.send', label: 'Send Messages', category: 'communications', description: 'Send SMS and email messages' },
  { name: 'communications.bulk', label: 'Bulk Messages', category: 'communications', description: 'Send bulk communications' },
  { name: 'communications.templates', label: 'Manage Templates', category: 'communications', description: 'Create and edit message templates' },

  // Forms
  { name: 'forms.view', label: 'View Forms', category: 'forms', description: 'View form templates and responses' },
  { name: 'forms.manage', label: 'Manage Forms', category: 'forms', description: 'Create and edit form templates' },
  { name: 'forms.submissions', label: 'View Submissions', category: 'forms', description: 'View and export form submissions' },
  { name: 'forms.delete', label: 'Delete Forms', category: 'forms', description: 'Delete forms and submissions' },

  // Branches
  { name: 'branches.view', label: 'View Branches', category: 'branches', description: 'View branch information' },
  { name: 'branches.manage', label: 'Manage Branches', category: 'branches', description: 'Create, edit, and delete branches' },
  { name: 'branches.assign', label: 'Assign Staff', category: 'branches', description: 'Assign staff to branches' },

  // Sermons
  { name: 'sermons.view', label: 'View Sermons', category: 'sermons', description: 'Access sermon library' },
  { name: 'sermons.upload', label: 'Upload Sermons', category: 'sermons', description: 'Upload audio/video sermons' },
  { name: 'sermons.edit', label: 'Edit Sermons', category: 'sermons', description: 'Edit sermon metadata' },
  { name: 'sermons.delete', label: 'Delete Sermons', category: 'sermons', description: 'Remove sermons from library' },

  // Settings
  { name: 'settings.view', label: 'View Settings', category: 'settings', description: 'View church configuration' },
  { name: 'settings.manage', label: 'Manage Settings', category: 'settings', description: 'Modify church settings' },
  { name: 'settings.integrations', label: 'Manage Integrations', category: 'settings', description: 'Configure third-party integrations' },

  // Users
  { name: 'users.view', label: 'View Users', category: 'users', description: 'View user accounts and roles' },
  { name: 'users.manage', label: 'Manage Users', category: 'users', description: 'Create, edit, and deactivate users' },
  { name: 'users.permissions', label: 'Manage Permissions', category: 'users', description: 'Grant and revoke user permissions' },
  { name: 'users.roles', label: 'Manage Roles', category: 'users', description: 'Create and edit role templates' }
];

// Permission utility functions
export function getPermissionByName(name: string): Permission | undefined {
  return AVAILABLE_PERMISSIONS.find(p => p.name === name);
}

export function getPermissionsByCategory(category: PermissionCategory): Permission[] {
  return AVAILABLE_PERMISSIONS.filter(p => p.category === category);
}

export function getAllCategories(): PermissionCategory[] {
  return Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.category)));
}
