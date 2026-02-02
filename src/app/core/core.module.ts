// src/app/core/core.module.ts
import { NgModule, Optional, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { SupabaseService } from './services/supabase';
import { AuthService } from './services/auth';
import { StorageService } from './services/storage';
import { RealtimeService } from './services/realtime';
import { AuthGuard } from './guards/auth-guard';
import { RoleGuard } from './guards/role-guard';
import { AuthInterceptor } from './interceptors/auth';
import { ErrorInterceptor } from './interceptors/error';
import { Features } from '../features/features/features';

// Services


@NgModule({
  declarations: [

  ],
  imports: [CommonModule],
  providers: [
    SupabaseService,
    AuthService,
    StorageService,
    RealtimeService,
    AuthGuard,
    RoleGuard,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true
    }
  ]
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it only in AppModule');
    }
  }
}
