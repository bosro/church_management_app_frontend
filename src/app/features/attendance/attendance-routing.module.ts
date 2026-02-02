// src/app/features/attendance/attendance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QrCheckin } from './components/qr-checkin/qr-checkin';
import { AttendanceDetail } from './components/attendance-detail/attendance-detail/attendance-detail';
import { MarkAttendance } from './components/mark-attendance/mark-attendance';
import { AttendanceReports } from './components/attendance-reports/attendance-reports';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { AttendanceList } from './components/attendance-list/attendance-list';


const routes: Routes = [
  { path: '', component: AttendanceList },
  { path: 'create', component: CreateEvent },
  { path: 'reports', component: AttendanceReports },
  // { path: 'visitors', component: VisitorList },
  { path: 'qr-checkin/:eventId', component: QrCheckin },
  { path: ':id', component: AttendanceDetail },
  { path: ':id/mark', component: MarkAttendance }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRoutingModule { }
