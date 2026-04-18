// src/app/features/cells/cells-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CellsList } from './cells-list/cells-list';
import { PermissionGuard } from '../../core/guards/permission.guard';

const routes: Routes = [
  {
    path: '',
    component: CellsList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Cell Groups',
      breadcrumb: 'Cell Groups',
      // Any user granted members.view permission OR matching one of these roles gets in.
      // The component itself then controls what actions (create/edit/delete) are shown.
      permission: 'members.view',
      roles: [
        'super_admin',
        'church_admin',
        'pastor',
        'senior_pastor',
        'associate_pastor',
        'ministry_leader',
        'group_leader',
        'cell_leader',    // cell leaders can view and manage their own group
        'finance_officer',
        'elder',
        'deacon',
        'worship_leader',
        'secretary',
      ],
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CellRoutingModule {}
