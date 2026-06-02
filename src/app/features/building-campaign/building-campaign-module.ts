// src/app/features/building-campaign/building-campaign.module.ts
// FINAL version — replace the earlier draft with this one

import { NgModule, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { CommitmentDetail } from './components/commitment-detail/commitment-detail';
import {
  CommitmentsList,
} from './components/commitment-list/commitment-list';
import { CommitmentForm } from './components/commitment-form/commitment-form';
import { SharedModule } from '../../shared/shared-module';

// ── Tiny pipe so the list template can do [a, b] | min ───────
@Pipe({ name: 'min', standalone: false })
export class MinPipe implements PipeTransform {
  transform(value: number[]): number {
    return Math.min(...value);
  }
}

const ADMIN_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'finance_officer',
];

const routes: Routes = [
  // Form — open to all authenticated users (members fill this in)
  {
    path: 'new',
    component: CommitmentForm,
  },
  // Admin list — staff only
  {
    path: '',
    component: CommitmentsList,
    canActivate: [PermissionGuard],
    data: { roles: ADMIN_ROLES },
  },
  // Detail / payment recording
  {
    path: ':id',
    component: CommitmentDetail,
    canActivate: [PermissionGuard],
    data: { roles: ADMIN_ROLES },
  },
];

@NgModule({
  declarations: [CommitmentDetail, CommitmentsList, CommitmentForm],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    RouterModule.forChild(routes),
    // ↓ Import your app's SharedModule so <app-sidebar>, <app-header>
    //   and <app-loading-spinner> are available in these templates.
    //   Adjust the import path to wherever your SharedModule lives.
    // SharedModule,
  ],
})
export class BuildingCampaignModule {}



