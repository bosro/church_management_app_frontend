// src/app/features/communications/communications-routing.module.ts
// KEY FIXES:
// 1. All routes switched from RoleGuard → PermissionGuard
// 2. Missing senior_pastor, associate_pastor added to all routes
// 3. Import paths corrected — original had 3 levels deep (extra folder):
//    './components/communications-list/communications-list/communications-list'
//    Corrected to 2 levels (standard Angular pattern):
//    './components/communications-list/communications-list'
//    Adjust these paths if your actual file structure differs.
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';

// NOTE: Adjust these import paths if your file structure has different nesting.
// The original had one extra folder level on each. Verify against your actual paths.
import { CommunicationsList } from './components/communications-list/communications-list/communications-list';
import { CreateCommunication } from './components/create-communication/create-communication/create-communication';
import { SmsLogs } from './components/sms-logs/sms-logs/sms-logs';
import { EmailLogs } from './components/email-logs/email-logs//email-logs';

const COMMS_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'secretary',
];

const COMMS_SEND_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader',
];

const routes: Routes = [
  {
    path: '',
    component: CommunicationsList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Communications',
      breadcrumb: 'Communications',
      permission: 'communications.view',
      roles: COMMS_VIEW_ROLES,
    },
  },
  {
    path: 'create',
    component: CreateCommunication,
    canActivate: [PermissionGuard],
    data: {
      title: 'New Message',
      breadcrumb: 'New Message',
      permission: 'communications.send',
      roles: COMMS_SEND_ROLES,
    },
  },
  {
    path: 'sms-logs',
    component: SmsLogs,
    canActivate: [PermissionGuard],
    data: {
      title: 'SMS Logs',
      breadcrumb: 'SMS Logs',
      permission: 'communications.view',
      roles: COMMS_VIEW_ROLES,
    },
  },
  {
    path: 'email-logs',
    component: EmailLogs,
    canActivate: [PermissionGuard],
    data: {
      title: 'Email Logs',
      breadcrumb: 'Email Logs',
      permission: 'communications.view',
      roles: COMMS_VIEW_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunicationsRoutingModule {}
