import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { BranchesList } from './eatures/branches/components/branches-list/branches-list/branches-list';
import { CreateBlog } from './eatures/cms/components/create-blog/create-blog';

@NgModule({
  declarations: [
    App,
    BranchesList,
    CreateBlog
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners()
  ],
  bootstrap: [App]
})
export class AppModule { }
