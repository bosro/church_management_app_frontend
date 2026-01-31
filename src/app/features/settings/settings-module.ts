import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    Settings
  ],
  imports: [
    CommonModule
  ]
})
export class SettingsModule { }
// src/app/features/settings/settings.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { SettingsRoutingModule } from './settings-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { SettingsService } from './services/settings.service';

// Components
import { SettingsComponent } from './components/settings/settings.component';
import { Settings } from './components/settings/settings';

@NgModule({
  declarations: [
    SettingsComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    SettingsRoutingModule
  ],
  providers: [
    SettingsService
  ]
})
export class SettingsModule { }
