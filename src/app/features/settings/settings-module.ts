import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { Settings } from './components/settings/settings';
import { SettingsRoutingModule } from './settings-routing.module';



@NgModule({
  declarations: [
    Settings
  ],
  imports: [
    CommonModule,
     ReactiveFormsModule,
    FormsModule,
    SharedModule,
    SettingsRoutingModule
  ]
})
export class SettingsModule { }

