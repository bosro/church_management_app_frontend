
// src/app/shared/components/header/header.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit {
  currentUser: User | null = null;
  searchQuery = '';
  showUserMenu = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentProfile$.subscribe(profile => {
      this.currentUser = profile;
    });
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      // Navigate to search results or filter current page
      console.log('Searching for:', this.searchQuery);
    }
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  navigateToProfile(): void {
    this.router.navigate(['main/settings/profile']);
    this.showUserMenu = false;
  }

  navigateToSettings(): void {
    this.router.navigate(['main/settings']);
    this.showUserMenu = false;
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
    this.showUserMenu = false;
  }
}
