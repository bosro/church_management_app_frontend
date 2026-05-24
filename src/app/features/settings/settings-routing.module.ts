// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Settings } from './components/settings/settings';
import { SubscriptionCallback } from './subscription-callback/subscription-callback';



const routes: Routes = [
  { path: '', component: Settings },
  { path: 'subscription/callback', component: SubscriptionCallback },

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingsRoutingModule { }
