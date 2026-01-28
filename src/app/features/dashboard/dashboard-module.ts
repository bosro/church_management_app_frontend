import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Overview } from './components/overview/overview';
import { StatsCard } from './components/stats-card/stats-card';
import { RevenueChart } from './components/revenue-chart/revenue-chart';
import { BirthdayList } from './components/birthday-list/birthday-list';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { DashboardRoutingModule } from './dashboard-routing.module';



@NgModule({
  declarations: [
    Overview,
    StatsCard,
    RevenueChart,
    BirthdayList
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    DashboardRoutingModule
  
  ]
})
export class DashboardModule { }



