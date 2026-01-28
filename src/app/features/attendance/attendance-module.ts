import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttendanceReports } from './components/attendance-reports/attendance-reports';
import { AttendanceList } from './components/attendance-list/attendance-list';
import { MarkAttendance } from './components/mark-attendance/mark-attendance';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { AttendanceRoutingModule } from './attendance-routing.module';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { QrCheckin } from './components/qr-checkin/qr-checkin';
import { AttendanceDetail } from './components/attendance-detail/attendance-detail/attendance-detail';



@NgModule({
  declarations: [
    AttendanceList,
    MarkAttendance,
    QrCheckin,
    AttendanceReports,
    CreateEvent,
    AttendanceDetail


  ],
  imports: [
     CommonModule,
    ReactiveFormsModule,
    SharedModule,
    AttendanceRoutingModule
  ]
})
export class AttendanceModule { }


