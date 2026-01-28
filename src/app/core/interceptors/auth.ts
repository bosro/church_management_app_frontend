// src/app/core/interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { SupabaseService } from '../services/supabase';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private supabase: SupabaseService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Add auth token to requests if available
    const user = this.supabase.currentUser;

    if (user) {
      // Clone request and add authorization header
      const clonedRequest = request.clone({
        setHeaders: {
          Authorization: `Bearer ${user.id}` // Supabase handles this internally
        }
      });
      return next.handle(clonedRequest);
    }

    return next.handle(request);
  }
}
