import { Component } from '@angular/core';

@Component({
  selector: 'app-cms-overview',
  standalone: false,
  templateUrl: './cms-overview.html',
  styleUrl: './cms-overview.scss',
})
export class CmsOverview {

}
// src/app/features/cms/components/cms-overview/cms-overview.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CmsService } from '../../services/cms.service';

@Component({
  selector: 'app-cms-overview',
  templateUrl: './cms-overview.component.html',
  styleUrls: ['./cms-overview.component.scss']
})
export class CmsOverviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  statistics: any = null;
  loading = true;

  constructor(
    private cmsService: CmsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStatistics(): void {
    this.loading = true;

    this.cmsService.getCmsStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics = stats;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading statistics:', error);
          this.loading = false;
        }
      });
  }

  // Navigation
  navigateToPages(): void {
    this.router.navigate(['/cms/pages']);
  }

  navigateToBlog(): void {
    this.router.navigate(['/cms/blog']);
  }

  createPage(): void {
    this.router.navigate(['/cms/pages/create']);
  }

  createBlogPost(): void {
    this.router.navigate(['/cms/blog/create']);
  }
}
