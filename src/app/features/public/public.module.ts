// src/app/features/public/public.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { QrCodeModule } from 'ng-qrcode'; // or whatever your qr package is

import { LinkCheckin } from './link-checkin/link-checkin';
import { MemberRegistration } from './member-registration/member-registration';

const routes: Routes = [
  {
    path: 'link-checkin/:token',
    component: LinkCheckin,
  },
  {
    path: 'register/:token',
    component: MemberRegistration,
  },
];

@NgModule({
  declarations: [
    LinkCheckin,
    MemberRegistration,
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
