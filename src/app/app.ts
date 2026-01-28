import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.scss'
})
export class App {
  protected title = 'church-management-frontend';
}


// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Churchman';
  showLayout = true;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Check if current route needs layout
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.showLayout = !event.url.includes('/auth');
      });

    // Initialize authentication state
    this.initializeAuth();
  }

  private initializeAuth(): void {
    // Auth state is handled by AuthService and SupabaseService
    // Redirect to signin if not authenticated
    if (!this.authService.isAuthenticated && !this.router.url.includes('/auth')) {
      this.router.navigate(['/auth/signin']);
    }
  }
}
