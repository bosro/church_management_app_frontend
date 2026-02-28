import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttendanceReports } from './components/attendance-reports/attendance-reports';
import { AttendanceList } from './components/attendance-list/attendance-list';
import { MarkAttendance } from './components/mark-attendance/mark-attendance';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { AttendanceRoutingModule } from './attendance-routing.module';
// import { CreateEvent } from './components/create-event/create-event/create-event';
import { QrCheckin } from './components/qr-checkin/qr-checkin';
import { AttendanceDetail } from './components/attendance-detail/attendance-detail/attendance-detail';
import { QrCodeComponent } from 'ng-qrcode';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { CheckIn } from './components/check-in/check-in/check-in';

@NgModule({
  declarations: [
    AttendanceList,
    MarkAttendance,
    QrCheckin,
    AttendanceReports,
    CreateEvent,
    AttendanceDetail,
    CheckIn,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    AttendanceRoutingModule,
    QrCodeComponent,
  ],
})
export class AttendanceModule {}
