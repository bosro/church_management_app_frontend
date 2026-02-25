// src/app/core/interceptors/auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SupabaseService } from '../services/supabase';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private supabase: SupabaseService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // ✅ Get the actual session token from Supabase
    return from(this.supabase.client.auth.getSession()).pipe(
      switchMap(({ data: { session } }) => {
        if (session?.access_token) {
          const clonedRequest = request.clone({
            setHeaders: {
              Authorization: `Bearer ${session.access_token}` // ✅ Use actual access token
            }
          });
          return next.handle(clonedRequest);
        }

        return next.handle(request);
      })
    );
  }
}
