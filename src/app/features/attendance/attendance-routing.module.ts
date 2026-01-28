// src/app/features/attendance/attendance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AttendanceListComponent } from './components/attendance-list/attendance-list.component';
import { AttendanceDetailComponent } from './components/attendance-detail/attendance-detail.component';
import { CreateEventComponent } from './components/create-event/create-event.component';
import { MarkAttendanceComponent } from './components/mark-attendance/mark-attendance.component';
import { QrCheckinComponent } from './components/qr-checkin/qr-checkin.component';
import { AttendanceReportsComponent } from './components/attendance-reports/attendance-reports.component';
import { VisitorListComponent } from './components/visitor-list/visitor-list.component';

const routes: Routes = [
  { path: '', component: AttendanceListComponent },
  { path: 'create', component: CreateEventComponent },
  { path: 'reports', component: AttendanceReportsComponent },
  { path: 'visitors', component: VisitorListComponent },
  { path: 'qr-checkin/:eventId', component: QrCheckinComponent },
  { path: ':id', component: AttendanceDetailComponent },
  { path: ':id/mark', component: MarkAttendanceComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRoutingModule { }
