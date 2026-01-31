import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    CommunicationsList,
    CreateCommunication,
    SmsLogs,
    EmailLogs
  ],
  imports: [
    CommonModule
  ]
})
export class CommunicationsModule { }
// src/app/features/communications/communications.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { CommunicationsRoutingModule } from './communications-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { CommunicationsService } from './services/communications.service';

// Components
import { CommunicationsListComponent } from './components/communications-list/communications-list.component';
import { CreateCommunicationComponent } from './components/create-communication/create-communication.component';
import { SmsLogsComponent } from './components/sms-logs/sms-logs.component';
import { EmailLogsComponent } from './components/email-logs/email-logs.component';
import { CommunicationsList } from './components/communications-list/communications-list/communications-list';
import { CreateCommunication } from './components/create-communication/create-communication/create-communication';
import { SmsLogs } from './components/sms-logs/sms-logs/sms-logs';
import { EmailLogs } from './components/email-logs/email-logs/email-logs';

@NgModule({
  declarations: [
    CommunicationsListComponent,
    CreateCommunicationComponent,
    SmsLogsComponent,
    EmailLogsComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    CommunicationsRoutingModule
  ],
  providers: [
    CommunicationsService
  ]
})
export class CommunicationsModule { }
