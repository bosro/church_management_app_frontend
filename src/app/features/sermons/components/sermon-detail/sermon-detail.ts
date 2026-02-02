
// src/app/features/sermons/components/sermon-detail/sermon-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Sermon, SermonsService } from '../../services/sermons';

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sermonsService: SermonsService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.sermonId = this.route.snapshot.paramMap.get('id') || '';
    if (this.sermonId) {
      this.loadSermon();
      this.incrementViewCount();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSermon(): void {
    this.loading = true;

    this.sermonsService.getSermonById(this.sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sermon) => {
          this.sermon = sermon;
          this.processVideoUrl(sermon.video_url);
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load sermon';
          this.loading = false;
        }
      });
  }

  private incrementViewCount(): void {
    this.sermonsService.incrementViewCount(this.sermonId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  private processVideoUrl(url?: string): void {
    if (!url) {
      this.safeVideoUrl = null;
      return;
    }

    // Convert YouTube watch URLs to embed URLs
    let embedUrl = url;
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
      embedUrl = `https://player.vimeo.com/video/${videoId}`;
    }

    this.safeVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  }

  goBack(): void {
    this.router.navigate(['/sermon']);
  }

  editSermon(): void {
    this.router.navigate(['/sermon', this.sermonId, 'edit']);
  }

  downloadAudio(): void {
    if (this.sermon?.audio_url) {
      this.sermonsService.incrementDownloadCount(this.sermonId)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
      window.open(this.sermon.audio_url, '_blank');
    }
  }

  downloadNotes(): void {
    if (this.sermon?.notes_url) {
      window.open(this.sermon.notes_url, '_blank');
    }
  }

  formatDuration(minutes?: number): string {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }
}
