// src/app/features/communications/communications-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommunicationsList } from './components/communications-list/communications-list/communications-list';
import { CreateCommunication } from './components/create-communication/create-communication/create-communication';
import { SmsLogs } from './components/sms-logs/sms-logs/sms-logs';
import { EmailLogs } from './components/email-logs/email-logs/email-logs';
import { RoleGuard } from '../../core/guards/role-guard';

const routes: Routes = [
  {
    path: '',
    component: CommunicationsList,
    canActivate: [RoleGuard],
    data: {
      title: 'Communications',
      breadcrumb: 'Communications',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'ministry_leader',
        'secretary',
      ],
    },
  },
  {
    path: 'create',
    component: CreateCommunication,
    canActivate: [RoleGuard],
    data: {
      title: 'New Message',
      breadcrumb: 'New Message',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
    },
  },
  {
    path: 'sms-logs',
    component: SmsLogs,
    canActivate: [RoleGuard],
    data: {
      title: 'SMS Logs',
      breadcrumb: 'SMS Logs',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'ministry_leader',
        'secretary',
      ],
    },
  },
  {
    path: 'email-logs',
    component: EmailLogs,
    canActivate: [RoleGuard],
    data: {
      title: 'Email Logs',
      breadcrumb: 'Email Logs',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'ministry_leader',
        'secretary',
      ],
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunicationsRoutingModule {}
