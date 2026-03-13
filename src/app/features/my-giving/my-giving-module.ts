import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MyGivingRoutingModule } from './my-giving-routing-module';
import { GivingDashboard } from './components/giving-dashboard/giving-dashboard';
import { MakePayment } from './components/make-payment/make-payment';
import { GivingHistory } from './components/giving-history/giving-history';
import { PaymentForm } from './components/payment-form/payment-form';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { GivingHistoryPage } from './pages/giving-history-page/giving-history-page';


@NgModule({
  declarations: [
    GivingDashboard,
    MakePayment,
    GivingHistory,
    PaymentForm,
    GivingHistoryPage
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MyGivingRoutingModule,
    SharedModule,
  ]
})
export class MyGivingModule { }


