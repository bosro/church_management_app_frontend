// src/app/shared/components/header/header.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
export class Header implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private profileLoaded = false;

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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCurrentUser(): void {
    this.authService.currentProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.currentUser = profile;
      });
  }

  private loadChurchProfile(): void {
  // Step 1: Read synchronously from BehaviorSubject cache if available
  try {
    const cached = (this.settingsService.churchProfile$ as any).getValue?.();
    if (cached) {
      this.churchProfile = cached;
      this.profileLoaded = true;
    }
  } catch (_) {}

  // Step 2: Subscribe for future updates — but NEVER overwrite with null
  this.settingsService.churchProfile$
    .pipe(takeUntil(this.destroy$))
    .subscribe((profile) => {
      if (profile) {
        this.churchProfile = profile;
        this.profileLoaded = true;
      }
    });

  // Step 3: If nothing in cache, fetch from DB — with slight delay
  // to allow auth/churchId to settle on hard refresh of dashboard
  if (!this.profileLoaded) {
    setTimeout(() => {
      if (!this.profileLoaded && !this.destroy$.isStopped) {
        this.fetchProfileDirectly();
      }
    }, 100); // small delay lets auth profile emit first
  }
}

  private fetchProfileDirectly(): void {
    this.settingsService
      .getChurchProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          if (profile && !this.churchProfile) {
            this.churchProfile = profile;
            this.profileLoaded = true;
          }
        },
        error: (err) => {
          console.error('Header: failed to load church profile', err);
          // Retry once after 2s for transient load errors on hard refresh
          if (!this.profileLoaded) {
            setTimeout(() => {
              if (!this.profileLoaded && !this.destroy$.isStopped) {
                this.fetchProfileDirectly();
              }
            }, 2000);
          }
        },
      });
  }

  refreshChurchProfile(): void {
    this.fetchProfileDirectly();
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


