// src/app/features/communications/communications-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommunicationsListComponent } from './components/communications-list/communications-list.component';
import { CreateCommunicationComponent } from './components/create-communication/create-communication.component';
import { SmsLogsComponent } from './components/sms-logs/sms-logs.component';
import { EmailLogsComponent } from './components/email-logs/email-logs.component';

const routes: Routes = [
  { path: '', component: CommunicationsListComponent },
  { path: 'create', component: CreateCommunicationComponent },
  { path: 'sms-logs', component: SmsLogsComponent },
  { path: 'email-logs', component: EmailLogsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CommunicationsRoutingModule { }
