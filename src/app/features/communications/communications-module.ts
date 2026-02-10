import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { CommunicationsRoutingModule } from './communications-routing.module';
import { CreateCommunication } from './components/create-communication/create-communication/create-communication';
import { EmailLogs } from './components/email-logs/email-logs/email-logs';
import { SmsLogs } from './components/sms-logs/sms-logs/sms-logs';
import { CommunicationsList } from './components/communications-list/communications-list/communications-list';

@NgModule({
  declarations: [CommunicationsList, CreateCommunication, SmsLogs, EmailLogs],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    CommunicationsRoutingModule,
  ],
})
export class CommunicationsModule {}
