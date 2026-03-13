// src/app/features/my-giving/my-giving-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MakePayment } from './components/make-payment/make-payment';
import { GivingDashboard } from './components/giving-dashboard/giving-dashboard';
import { GivingHistory } from './components/giving-history/giving-history';
import { GivingHistoryPage } from './pages/giving-history-page/giving-history-page';

const routes: Routes = [
  {
    path: '',
    component: GivingDashboard,
  },
  {
    path: 'make-payment',
    component: MakePayment,
  },

  {
    path: 'history',
    component: GivingHistoryPage, // ✅ page component, not the display component
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MyGivingRoutingModule {}
