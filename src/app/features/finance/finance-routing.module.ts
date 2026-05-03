// src/app/features/finance/finance-routing.module.ts
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
import { CategoryExpenses } from './components/category-expenses/category-expenses';
import { PaymentLinks } from './components/payment-links/payment-links';

const FINANCE_VIEW_ROLES = [
  'super_admin',
  'church_admin',
  'pastor',
  'senior_pastor',
  'associate_pastor',
  'finance_officer',
];

const FINANCE_MANAGE_ROLES = ['super_admin', 'church_admin', 'finance_officer'];

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
  {
    path: 'payment-links',
    component: PaymentLinks,
    canActivate: [PermissionGuard],
    data: {
      title: 'Payment Links',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
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
  // ── NEW ─────────────────────────────────────────────────────
  {
    path: 'expenses',
    component: CategoryExpenses,
    canActivate: [PermissionGuard],
    data: {
      title: 'Category Expenses',
      permission: 'finance.view',
      roles: FINANCE_VIEW_ROLES,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FinanceRoutingModule {}
