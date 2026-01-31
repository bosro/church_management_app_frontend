import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';



@NgModule({
  declarations: [
    EventsList,
    CreateEvent,
    EditEvent,
    EventDetail
  ],
  imports: [
    CommonModule
  ]
})
export class EventsModule { }

// src/app/features/events/events.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { EventsRoutingModule } from './events-routing.module';
import { SharedModule } from '../../shared/shared.module';

// Services
import { EventsService } from './services/events.service';

// Components
import { EventsListComponent } from './components/events-list/events-list.component';
import { EventDetailComponent } from './components/event-detail/event-detail.component';
import { CreateEventComponent } from './components/create-event/create-event.component';
import { EditEventComponent } from './components/edit-event/edit-event.component';
import { EventsList } from './events-list/events-list';
import { CreateEvent } from './components/create-event/create-event/create-event';
import { EditEvent } from './components/edit-event/edit-event/edit-event';
import { EventDetail } from './components/event-detail/event-detail/event-detail';

@NgModule({
  declarations: [
    EventsListComponent,
    EventDetailComponent,
    CreateEventComponent,
    EditEventComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SharedModule,
    EventsRoutingModule
  ],
  providers: [
    EventsService
  ]
})
export class EventsModule { }
