import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventsList } from './components/events-list/events-list';
import { EditEvent } from './components/edit-event/edit-event/edit-event';
import { EventDetail } from './components/event-detail/event-detail/event-detail';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { EventsRoutingModule } from './events-routing.module';
import { CreateEvent } from './components/create-event/create-event/create-event';

@NgModule({
  declarations: [EventsList, CreateEvent, EditEvent, EventDetail],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    EventsRoutingModule,
  ],
})
export class EventsModule {}
