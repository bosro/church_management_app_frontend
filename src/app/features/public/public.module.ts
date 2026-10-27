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
import { PublicEventRegistration } from './event-registration/event-registration';
import { GivingThankYouPage } from './giving-thank-you/giving-thank-you';
import { CommitmentForm } from '../building-campaign/components/commitment-form/commitment-form';
import { BuildingCampaignPaymentCallback } from './building-campaign-payment-callback/building-campaign-payment-callback';
import { PublicGive } from './public-give/public-give';
import { PublicGiveCallback } from './public-give-callback/public-give-callback';

const routes: Routes = [
  // ── QR giving (no login) ─ 'give/thank-you' must stay ABOVE 'give/:churchId'
  { path: 'give/thank-you', component: PublicGiveCallback },
  { path: 'give/:churchId', component: PublicGive },
  { path: 'give/:churchId/:categoryId', component: PublicGive },
  {
    path: 'giving/thank-you',
    component: GivingThankYouPage,
    // No canActivate — anyone who paid via a payment link lands here
  },
  {
  path: 'building-campaign/payment-callback',
  component: BuildingCampaignPaymentCallback,
},
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
  {
    path: 'event-register/:eventId',
    component: PublicEventRegistration,
  },
   {
    path: 'building-campaign/:churchId',
    component: CommitmentForm,
  },
];

@NgModule({
  declarations: [
    LinkCheckin,
    MemberRegistration,
    FeedingRecord,
    PublicStudentRegistration,
    PublicEventRegistration,
    GivingThankYouPage,
    BuildingCampaignPaymentCallback,
    PublicGive,
    PublicGiveCallback,
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
