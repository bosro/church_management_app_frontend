// src/app/features/attendance/attendance-routing.module.ts
// KEY FIX: Replaced RoleGuard with PermissionGuard on ALL routes.
// Added cell_leader, group_leader, senior_pastor, associate_pastor etc.
// to every route they belong on.
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { QrCheckin } from './components/qr-checkin/qr-checkin';
import { AttendanceDetail } from './components/attendance-detail/attendance-detail/attendance-detail';
import { MarkAttendance } from './components/mark-attendance/mark-attendance';
import { AttendanceReports } from './components/attendance-reports/attendance-reports';
import { AttendanceList } from './components/attendance-list/attendance-list';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { CheckIn } from './components/check-in/check-in/check-in';
import { AttendanceVisitors } from './components/attendance-visitors/attendance-visitors';

// Every role that can view attendance in any capacity
const ALL_ATTENDANCE_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'ministry_leader',
  'group_leader',
  'cell_leader',
  'finance_officer',
  'elder',
  'deacon',
  'worship_leader',
  'secretary',
  'usher',
];

const routes: Routes = [
  {
    path: '',
    component: AttendanceList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Attendance',
      permission: 'attendance.view',
      roles: ALL_ATTENDANCE_ROLES,
    },
  },
  {
    path: 'create',
    component: CreateEvent,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Event',
      permission: 'attendance.manage',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
      ],
    },
  },
  {
    path: 'reports',
    component: AttendanceReports,
    canActivate: [PermissionGuard],
    data: {
      title: 'Attendance Reports',
      permission: 'attendance.view',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
        'cell_leader',
        'finance_officer',
        'secretary',
      ],
    },
  },
  {
    path: 'check-in',
    component: CheckIn,
    canActivate: [PermissionGuard],
    data: {
      title: 'Check In',
      permission: 'attendance.checkin',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
        'cell_leader',
        'usher',
      ],
    },
  },
  {
    path: 'visitors',
    component: AttendanceVisitors,
    canActivate: [PermissionGuard],
    data: {
      title: 'Visitors',
      permission: 'attendance.view',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
        'cell_leader',
        'secretary',
      ],
    },
  },
  {
    path: 'qr-checkin/:eventId',
    component: QrCheckin,
    // No guard — public self-check-in route
  },
  {
    path: ':id',
    component: AttendanceDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Event Details',
      permission: 'attendance.view',
      roles: ALL_ATTENDANCE_ROLES,
    },
  },
  {
    path: ':id/mark',
    component: MarkAttendance,
    canActivate: [PermissionGuard],
    data: {
      title: 'Mark Attendance',
      permission: 'attendance.checkin',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
        'cell_leader',
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



