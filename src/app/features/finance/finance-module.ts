import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GivingList } from './components/giving-list/giving-list';
import { RecordGiving } from './components/record-giving/record-giving';
import { Pledges } from './components/pledges/pledges';
import { FinanceReports } from './components/finance-reports/finance-reports';
import { ReactiveFormsModule } from '@angular/forms';
import { FinanceRoutingModule } from './finance-routing.module';
import { SharedModule } from '../../shared/shared-module';
import { FinanceOverview } from './components/finance-overview/finance-overview/finance-overview';
import { CategoriesManagement } from './components/categories-management/categories-management/categories-management';
import { CreatePledge } from './components/create-pledge/create-pledge/create-pledge';
import { PledgeDetails } from './pledge-details/pledge-details';



@NgModule({
  declarations: [
    GivingList,
    RecordGiving,
    Pledges,
    FinanceReports,
    FinanceOverview,
    CreatePledge,
    CategoriesManagement,
    PledgeDetails
  ],
  imports: [
      CommonModule,
    ReactiveFormsModule,
    SharedModule,
    FinanceRoutingModule
  ]
})
export class FinanceModule { }





