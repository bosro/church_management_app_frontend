// src/app/features/sermons/components/sermon-detail/sermon-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SermonsService } from '../../services/sermons';
import { Sermon } from '../../../../models/sermon.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-sermon-detail',
  standalone: false,
  templateUrl: './sermon-detail.html',
  styleUrl: './sermon-detail.scss',
})
export class SermonDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sermonId: string = '';
  sermon: Sermon | null = null;
  loading = true;
  errorMessage = '';

  safeVideoUrl: SafeResourceUrl | null = null;

  // Permissions
  canManageSermons = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sermonsService: SermonsService,
    private sanitizer: DomSanitizer,
    public permissionService: PermissionService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.sermonId = this.route.snapshot.paramMap.get('id') || '';

    if (this.sermonId) {
      this.loadSermon();
      this.incrementViewCount();
    } else {
      this.errorMessage = 'Invalid sermon ID';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const role = this.authService.getCurrentUserRole();

    const viewRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'ministry_leader',
      'group_leader',
      'cell_leader',
      'finance_officer',
      'elder',
      'deacon',
      'worship_leader',
      'secretary',
    ];
    const manageRoles = [
      'pastor',
      'senior_pastor',
      'associate_pastor',
      'worship_leader',
    ];

    const canView =
      this.permissionService.isAdmin ||
      this.permissionService.sermons.view ||
      viewRoles.includes(role);

    // FIX: was only checking sermons.edit — now includes upload and delete
    this.canManageSermons =
      this.permissionService.isAdmin ||
      this.permissionService.sermons.upload ||
      this.permissionService.sermons.edit ||
      this.permissionService.sermons.delete ||
      manageRoles.includes(role);

    if (!canView) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadSermon(): void {
    this.loading = true;
    this.errorMessage = '';

    this.sermonsService
      .getSermonById(this.sermonId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (sermon) => {
          this.sermon = sermon;
          this.processVideoUrl(sermon.video_url);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load sermon';
          console.error('Error loading sermon:', error);
        },
      });
  }

  private incrementViewCount(): void {
    // Increment view count in background (don't wait for response)
    this.sermonsService
      .incrementViewCount(this.sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (error) => {
          console.error('Error incrementing view count:', error);
          // Silently fail - this is non-critical
        },
      });
  }

  private processVideoUrl(url?: string): void {
    if (!url) {
      this.safeVideoUrl = null;
      return;
    }

    const embedUrl = this.sermonsService.processVideoUrl(url);
    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  }

  goBack(): void {
    // FIX: was 'main/sermon' (singular)
    this.router.navigate(['main/sermons']);
  }

  editSermon(): void {
    if (!this.canManageSermons) {
      alert('You do not have permission to edit sermons');
      return;
    }
    // FIX: was 'main/sermon' (singular)
    this.router.navigate(['main/sermons', this.sermonId, 'edit']);
  }

  downloadAudio(): void {
    if (!this.sermon?.audio_url) return;

    // Increment download count in background
    this.sermonsService
      .incrementDownloadCount(this.sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (error) => {
          console.error('Error incrementing download count:', error);
          // Silently fail - this is non-critical
        },
      });

    // Open audio URL in new tab
    window.open(this.sermon.audio_url, '_blank');
  }

  downloadNotes(): void {
    if (!this.sermon?.notes_url) return;

    // Open notes URL in new tab
    window.open(this.sermon.notes_url, '_blank');
  }

  formatDuration(minutes?: number): string {
    return this.sermonsService.formatDuration(minutes);
  }
}
