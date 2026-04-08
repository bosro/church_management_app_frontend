// src/app/features/attendance/attendance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QrCheckin } from './components/qr-checkin/qr-checkin';
import { AttendanceDetail } from './components/attendance-detail/attendance-detail/attendance-detail';
import { MarkAttendance } from './components/mark-attendance/mark-attendance';
import { AttendanceReports } from './components/attendance-reports/attendance-reports';
import { AttendanceList } from './components/attendance-list/attendance-list';
import { RoleGuard } from '../../core/guards/role-guard';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { CheckIn } from './components/check-in/check-in/check-in';
import { AttendanceVisitors } from './components/attendance-visitors/attendance-visitors';
import { LinkCheckin } from './components/link-checkin/link-checkin';

const routes: Routes = [
  {
    path: '',
    component: AttendanceList,
    canActivate: [RoleGuard],
    data: {
      title: 'Attendance',
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
    component: CreateEvent,
    canActivate: [RoleGuard],
    data: {
      title: 'Create Event',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader'],
    },
  },
  {
    path: 'reports',
    component: AttendanceReports,
    canActivate: [RoleGuard],
    data: {
      title: 'Attendance Reports',
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
    path: 'check-in',
    component: CheckIn,
    canActivate: [RoleGuard],
    data: {
      title: 'Check In',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'ministry_leader',
        'usher',
        'group_leader',
      ],
    },
  },
  {
    path: 'visitors',
    component: AttendanceVisitors,
    canActivate: [RoleGuard],
    data: {
      title: 'Visitors',
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
    path: 'qr-checkin/:eventId',
    component: QrCheckin,
    // NO RoleGuard — public
  },
  {
    // ✅ MUST be before :id — link-checkin is a specific string segment
    path: 'link-checkin/:token',
    component: LinkCheckin,
    // NO RoleGuard — public
  },
  {
    path: ':id',
    component: AttendanceDetail,
    canActivate: [RoleGuard],
    data: {
      title: 'Event Details',
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
    path: ':id/mark',
    component: MarkAttendance,
    canActivate: [RoleGuard],
    data: {
      title: 'Mark Attendance',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'ministry_leader',
        'usher',
      ],
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AttendanceRoutingModule {}
