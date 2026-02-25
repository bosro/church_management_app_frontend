// src/app/features/finance/finance-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GivingList } from './components/giving-list/giving-list';
import { CreatePledge } from './components/create-pledge/create-pledge/create-pledge';
import { FinanceReports } from './components/finance-reports/finance-reports';
import { CategoriesManagement } from './components/categories-management/categories-management/categories-management';
import { FinanceOverview } from './components/finance-overview/finance-overview/finance-overview';
import { RecordGiving } from './components/record-giving/record-giving';
import { Pledges } from './components/pledges/pledges';
import { PledgeDetails } from './pledge-details/pledge-details';

const routes: Routes = [
  { path: '', component: FinanceOverview },
  { path: 'giving', component: GivingList },
  { path: 'record-giving', component: RecordGiving },
  { path: 'pledges', component: Pledges },
  { path: 'pledges/create', component: CreatePledge },
  { path: 'reports', component: FinanceReports },
  { path: 'categories', component: CategoriesManagement },
  { path: 'pledges/:id', component: PledgeDetails },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FinanceRoutingModule {}
