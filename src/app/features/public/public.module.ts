// src/app/features/public/public.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { QrCodeModule } from 'ng-qrcode';

import { LinkCheckin } from './link-checkin/link-checkin';
import { MemberRegistration } from './member-registration/member-registration';
import { FeedingRecord } from './feeding-record/feeding-record';
import { PublicStudentRegistration } from './public-student-registration/public-student-registration';

const routes: Routes = [
  {
    path: 'link-checkin/:token',
    component: LinkCheckin,
  },
  {
    path: 'register/:token',
    component: MemberRegistration,
  },
  {
    path: 'feeding-fees/:churchId', // ← was :token
    component: FeedingRecord,
  },
  {
    path: 'student-register/:token',
    component: PublicStudentRegistration,
  },
];

@NgModule({
  declarations: [
    LinkCheckin,
    MemberRegistration,
    FeedingRecord,
    PublicStudentRegistration,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    QrCodeModule,
    RouterModule.forChild(routes),
  ],
})
export class PublicModule {}
