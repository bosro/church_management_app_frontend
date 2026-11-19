import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { Settings } from './components/settings/settings';
import { SettingsRoutingModule } from './settings-routing.module';
import { SubscriptionCallback } from './subscription-callback/subscription-callback';
import { BrandingCard } from '../../shared/components/branding-card/branding-card';
import { SecurityCard } from '../../shared/components/security-card/security-card';

@NgModule({
  declarations: [
    Settings,
    SubscriptionCallback
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    SettingsRoutingModule,
    BrandingCard,   // standalone components are IMPORTED, never declared
    SecurityCard,
  ]
})
export class SettingsModule { }