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

// Available Permissions
export const AVAILABLE_PERMISSIONS: Permission[] = [
  // Members
  { name: 'members.view', label: 'View Members', category: 'members', description: 'View member information' },
  { name: 'members.create', label: 'Create Members', category: 'members', description: 'Add new members' },
  { name: 'members.edit', label: 'Edit Members', category: 'members', description: 'Edit member information' },
  { name: 'members.delete', label: 'Delete Members', category: 'members', description: 'Delete members' },
  { name: 'members.export', label: 'Export Members', category: 'members', description: 'Export member data' },

  // Attendance
  { name: 'attendance.view', label: 'View Attendance', category: 'attendance', description: 'View attendance records' },
  { name: 'attendance.manage', label: 'Manage Attendance', category: 'attendance', description: 'Create and edit attendance events' },
  { name: 'attendance.checkin', label: 'Check-in Members', category: 'attendance', description: 'Check-in members to events' },

  // Finance
  { name: 'finance.view', label: 'View Finance', category: 'finance', description: 'View financial records' },
  { name: 'finance.record', label: 'Record Giving', category: 'finance', description: 'Record donations and offerings' },
  { name: 'finance.manage', label: 'Manage Finance', category: 'finance', description: 'Full financial management' },
  { name: 'finance.reports', label: 'View Reports', category: 'finance', description: 'View financial reports' },

  // Ministries
  { name: 'ministries.view', label: 'View Ministries', category: 'ministries', description: 'View ministry information' },
  { name: 'ministries.manage', label: 'Manage Ministries', category: 'ministries', description: 'Create and edit ministries' },
  { name: 'ministries.assign', label: 'Assign Members', category: 'ministries', description: 'Assign members to ministries' },

  // Events
  { name: 'events.view', label: 'View Events', category: 'events', description: 'View events' },
  { name: 'events.create', label: 'Create Events', category: 'events', description: 'Create new events' },
  { name: 'events.edit', label: 'Edit Events', category: 'events', description: 'Edit event information' },
  { name: 'events.delete', label: 'Delete Events', category: 'events', description: 'Delete events' },

  // Communications
  { name: 'communications.view', label: 'View Communications', category: 'communications', description: 'View messages' },
  { name: 'communications.send', label: 'Send Messages', category: 'communications', description: 'Send SMS and emails' },

  // Forms
  { name: 'forms.view', label: 'View Forms', category: 'forms', description: 'View form templates' },
  { name: 'forms.manage', label: 'Manage Forms', category: 'forms', description: 'Create and edit forms' },
  { name: 'forms.submissions', label: 'View Submissions', category: 'forms', description: 'View form submissions' },

  // Branches
  { name: 'branches.view', label: 'View Branches', category: 'branches', description: 'View branch information' },
  { name: 'branches.manage', label: 'Manage Branches', category: 'branches', description: 'Create and edit branches' },

  // Sermons
  { name: 'sermons.view', label: 'View Sermons', category: 'sermons', description: 'View sermon library' },
  { name: 'sermons.upload', label: 'Upload Sermons', category: 'sermons', description: 'Upload new sermons' },
  { name: 'sermons.edit', label: 'Edit Sermons', category: 'sermons', description: 'Edit sermon information' },

  // Settings
  { name: 'settings.view', label: 'View Settings', category: 'settings', description: 'View church settings' },
  { name: 'settings.manage', label: 'Manage Settings', category: 'settings', description: 'Modify church settings' },

  // Users
  { name: 'users.view', label: 'View Users', category: 'users', description: 'View user accounts' },
  { name: 'users.manage', label: 'Manage Users', category: 'users', description: 'Create and edit users' },
  { name: 'users.permissions', label: 'Manage Permissions', category: 'users', description: 'Assign user permissions' }
];
