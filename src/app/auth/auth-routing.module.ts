// src/app/features/auth/auth-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OtpVerification } from './components/otp-verification/otp-verification';
import { ForgotPassword } from './components/forgot-password/forgot-password';
import { Signin } from './components/signin/signin';
import { Signup } from './components/signup/signup';
import { AuthLayout } from './components/auth-layout/auth-layout';
import { EmailConfirmed } from './components/email-confirmed/email-confirmed';
import { ResetPassword } from './components/reset-password/reset-password';
import { AcceptInvite } from './components/accept-invite/accept-invite';

const routes: Routes = [
  {
    path: '',
    component: AuthLayout,
    children: [
      { path: '', redirectTo: 'signin', pathMatch: 'full' },
      { path: 'signin', component: Signin },
      { path: 'signup', component: Signup },
      // { path: 'otp-verification', component: OtpVerification },
      { path: 'forgot-password', component: ForgotPassword },
      { path: 'reset-password', component: ResetPassword },
      { path: 'accept-invite', component: AcceptInvite },
      {
        path: 'email-confirmed',
        component: EmailConfirmed,
        data: { title: 'Email Confirmed' },
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
