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

const routes: Routes = [
  {
    path: '',
    component: AttendanceList,
    canActivate: [RoleGuard],
    data: {
      title: 'Attendance',
      breadcrumb: 'Attendance',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  // ✅ SPECIFIC ROUTES FIRST - These must come before ':id'
  {
    path: 'create',
    component: CreateEvent,
    canActivate: [RoleGuard],
    data: {
      title: 'Create Event',
      breadcrumb: 'Create Event',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader']
    }
  },
  {
    path: 'reports',
    component: AttendanceReports,
    canActivate: [RoleGuard],
    data: {
      title: 'Attendance Reports',
      breadcrumb: 'Reports',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
 {
  path: 'check-in',
  component: CheckIn, // ✅ Use the new component
  canActivate: [RoleGuard],
  data: {
    title: 'Check In',
    breadcrumb: 'Check In',
    roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'usher', 'group_leader']
  }
},
  {
    path: 'qr-checkin/:eventId',
    component: QrCheckin,
    data: {
      title: 'Check In',
      breadcrumb: 'QR Check-in'
    }
  },
  // ✅ PARAMETERIZED ROUTES LAST - ':id' must come after all specific routes
  {
    path: ':id',
    component: AttendanceDetail,
    canActivate: [RoleGuard],
    data: {
      title: 'Event Details',
      breadcrumb: 'Details',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
    }
  },
  {
    path: ':id/mark',
    component: MarkAttendance,
    canActivate: [RoleGuard],
    data: {
      title: 'Mark Attendance',
      breadcrumb: 'Mark Attendance',
      roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'usher']
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRoutingModule { }
