// src/app/features/events/events-routing.module.ts
// KEY FIX: CreateEvent was wrongly imported from the ATTENDANCE module.
// It now correctly imports from the events module's own create-event component.
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { EventsList } from './components/events-list/events-list';
import { EventDetail } from './components/event-detail/event-detail/event-detail';
import { EditEvent } from './components/edit-event/edit-event/edit-event';
import { CreateEvent } from './components/create-event/create-event/create-event';

// NOTE: If your CreateEvent component file is at a different path within the
// events folder, adjust the import above. The important thing is that it does
// NOT point to the attendance module's create-event.

const EVENTS_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader', 'group_leader', 'cell_leader',
  'finance_officer', 'elder', 'deacon', 'worship_leader', 'secretary',
];

const EVENTS_MANAGE_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'ministry_leader',
];

const routes: Routes = [
  {
    path: '',
    component: EventsList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Events',
      permission: 'events.view',
      roles: EVENTS_VIEW_ROLES,
    },
  },
  {
    path: 'create',
    component: CreateEvent,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Event',
      permission: 'events.create',
      roles: EVENTS_MANAGE_ROLES,
    },
  },
  {
    path: ':id',
    component: EventDetail,
    canActivate: [PermissionGuard],
    data: {
      title: 'Event Details',
      permission: 'events.view',
      roles: EVENTS_VIEW_ROLES,
    },
  },
  {
    path: ':id/edit',
    component: EditEvent,
    canActivate: [PermissionGuard],
    data: {
      title: 'Edit Event',
      permission: 'events.edit',
      roles: EVENTS_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EventsRoutingModule {}
