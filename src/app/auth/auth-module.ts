import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OtpVerification } from './components/otp-verification/otp-verification';
import { Signin } from './components/signin/signin';
import { Signup } from './components/signup/signup';
import { ForgotPassword } from './components/forgot-password/forgot-password';
import { AuthLayout } from './components/auth-layout/auth-layout';
import { ReactiveFormsModule } from '@angular/forms';
import { AuthRoutingModule } from './auth-routing.module';
import { SharedModule } from '../shared/shared-module';
import { EmailConfirmed } from './components/email-confirmed/email-confirmed';
import { ResetPassword } from './components/reset-password/reset-password';
import { AcceptInvite } from './components/accept-invite/accept-invite';



@NgModule({
  declarations: [
    OtpVerification,
    Signin,
    Signup,
    ForgotPassword,
    AuthLayout,
    EmailConfirmed,
    ResetPassword,
    AcceptInvite
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    AuthRoutingModule
  ]
})
export class AuthModule { }





