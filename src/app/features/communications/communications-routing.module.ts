// src/app/features/communications/communications-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommunicationsList } from './components/communications-list/communications-list/communications-list';
import { CreateCommunication } from './components/create-communication/create-communication/create-communication';
import { SmsLogs } from './components/sms-logs/sms-logs/sms-logs';
import { EmailLogs } from './components/email-logs/email-logs/email-logs';


const routes: Routes = [
  { path: '', component: CommunicationsList },
  { path: 'create', component: CreateCommunication },
  { path: 'sms-logs', component: SmsLogs },
  { path: 'email-logs', component: EmailLogs }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CommunicationsRoutingModule { }
