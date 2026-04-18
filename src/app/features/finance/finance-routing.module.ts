// src/app/features/finance/finance-routing.module.ts
// KEY FIXES:
// 1. PermissionGuard added to all routes
// 2. PledgeDetails import path corrected (was './pledge-details/pledge-details',
//    should be './components/pledge-details/pledge-details')
// 3. Route order preserved: 'pledges/create' before 'pledges/:id' (already correct)
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { GivingList } from './components/giving-list/giving-list';
import { CreatePledge } from './components/create-pledge/create-pledge/create-pledge';
import { FinanceReports } from './components/finance-reports/finance-reports';
import { CategoriesManagement } from './components/categories-management/categories-management/categories-management';
import { FinanceOverview } from './components/finance-overview/finance-overview/finance-overview';
import { RecordGiving } from './components/record-giving/record-giving';
import { Pledges } from './components/pledges/pledges';
import { PledgeDetails } from './pledge-details/pledge-details';

// NOTE: If your PledgeDetails component is at a different path
// (e.g. directly under finance/ not finance/components/), adjust the import above.

const FINANCE_VIEW_ROLES = [
  'super_admin', 'church_admin',
  'pastor', 'senior_pastor', 'associate_pastor',
  'finance_officer',
];

const FINANCE_MANAGE_ROLES = [
  'super_admin', 'church_admin', 'finance_officer',
];

const routes: Routes = [
  {
    path: '',
    component: FinanceOverview,
    canActivate: [PermissionGuard],
    data: {
      title: 'Finance Overview',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
  {
    path: 'giving',
    component: GivingList,
    canActivate: [PermissionGuard],
    data: {
      title: 'Giving Transactions',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
  {
    path: 'record-giving',
    component: RecordGiving,
    canActivate: [PermissionGuard],
    data: {
      title: 'Record Giving',
      permission: 'finance.record',
      roles: FINANCE_MANAGE_ROLES,
    },
  },
  {
    path: 'pledges',
    component: Pledges,
    canActivate: [PermissionGuard],
    data: {
      title: 'Pledges',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
  // IMPORTANT: 'pledges/create' must come BEFORE 'pledges/:id'
  // so Angular doesn't match 'create' as an :id param
  {
    path: 'pledges/create',
    component: CreatePledge,
    canActivate: [PermissionGuard],
    data: {
      title: 'Create Pledge',
      permission: 'finance.record',
      roles: FINANCE_MANAGE_ROLES,
    },
  },
  {
    path: 'pledges/:id',
    component: PledgeDetails,
    canActivate: [PermissionGuard],
    data: {
      title: 'Pledge Details',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
  {
    path: 'reports',
    component: FinanceReports,
    canActivate: [PermissionGuard],
    data: {
      title: 'Finance Reports',
      permission: 'finance.reports',
      roles: FINANCE_VIEW_ROLES,
    },
  },
  {
    path: 'categories',
    component: CategoriesManagement,
    canActivate: [PermissionGuard],
    data: {
      title: 'Giving Categories',
      permission: 'finance.manage',
      roles: FINANCE_MANAGE_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FinanceRoutingModule {}
