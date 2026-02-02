// src/app/features/events/events-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CreateEvent } from '../attendance/components/create-event/create-event/create-event';
import { EventDetail } from './components/event-detail/event-detail/event-detail';
import { EditEvent } from './components/edit-event/edit-event/edit-event';
import { EventsList } from './components/events-list/events-list';


const routes: Routes = [
  { path: '', component: EventsList },
  { path: 'create', component: CreateEvent },
  { path: ':id', component: EventDetail },
  { path: ':id/edit', component: EditEvent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EventsRoutingModule { }
