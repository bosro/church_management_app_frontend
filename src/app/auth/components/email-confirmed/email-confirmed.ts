
// src/app/features/auth/components/email-confirmed/email-confirmed.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { takeUntil, takeWhile } from 'rxjs/operators';

@Component({
  selector: 'app-email-confirmed',
  standalone: false,
  templateUrl: './email-confirmed.html',
  styleUrl: './email-confirmed.scss',
})
export class EmailConfirmed implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  countdown = 10;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Start countdown
    interval(1000)
      .pipe(
        takeUntil(this.destroy$),
        takeWhile(() => this.countdown > 0)
      )
      .subscribe(() => {
        this.countdown--;
        if (this.countdown === 0) {
          this.goToSignIn();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToSignIn(): void {
    this.router.navigate(['/auth/signin']);
  }
}
