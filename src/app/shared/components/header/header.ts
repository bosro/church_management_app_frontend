// src/app/shared/components/header/header.component.ts
import { Component, OnInit, HostListener, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '../../../models/user.model';
import { Church } from '../../../models/setting.model';
import { AuthService } from '../../../core/services/auth';
import { SettingsService } from '../../../features/settings/services';
import { SidebarService } from '../../../core/services/sidebar.service';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit {
  currentUser: User | null = null;
  churchProfile: Church | null = null;
  searchQuery = '';
  showUserMenu = false;
  showMobileSearch = false;
  isMobile = false;

  constructor(
    private authService: AuthService,
    private settingsService: SettingsService,
    private router: Router,
    private sidebarService: SidebarService,
    private elementRef: ElementRef,
  ) {}

  ngOnInit(): void {
  this.checkScreenSize();
  this.loadCurrentUser();
  this.loadChurchProfile();

  // ✅ NEW: Refresh church profile every 30 seconds
  setInterval(() => {
    this.loadChurchProfile();
  }, 30000); // 30 seconds
}

// ✅ NEW: Add public refresh method
refreshChurchProfile(): void {
  this.loadChurchProfile();
}

  private loadCurrentUser(): void {
    this.authService.currentProfile$.subscribe((profile) => {
      console.log('----', profile)
      this.currentUser = profile;
    });
  }

  private loadChurchProfile(): void {
  // ✅ CHANGED: Subscribe to the observable stream instead of calling once
  this.settingsService.churchProfile$.subscribe({
    next: (profile) => {
      if (profile) {
        this.churchProfile = profile;
      } else {
        // If null, load it for the first time
        this.settingsService.getChurchProfile().subscribe({
          error: (error) => {
            console.error('Error loading church profile:', error);
          }
        });
      }
    }
  });
}

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.showUserMenu = false;
    }
  }

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.showMobileSearch = false;
    }
  }

  toggleMobileSidebar(): void {
    this.sidebarService.toggle();
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/main/search'], {
        queryParams: { q: this.searchQuery },
      });
      this.searchQuery = '';
      this.showMobileSearch = false;
    }
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  toggleMobileSearch(): void {
    this.showMobileSearch = !this.showMobileSearch;
  }

  navigateToProfile(): void {
    this.router.navigate(['main/settings']);
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

  getRoleDisplayName(role: string): string {
    const roleMap: { [key: string]: string } = {
      super_admin: 'Super Admin',
      church_admin: 'Church Admin',
      pastor: 'Pastor',
      senior_pastor: 'Senior Pastor',
      associate_pastor: 'Associate Pastor',
      finance_officer: 'Finance Officer',
      group_leader: 'Group Leader',
      elder: 'Elder',
      member: 'Member',
    };
    return (
      roleMap[role] ||
      role.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  get churchLogoUrl(): string | null {
    return this.churchProfile?.logo_url || null;
  }

  get churchName(): string {
    return this.churchProfile?.name || 'Church';
  }
}


