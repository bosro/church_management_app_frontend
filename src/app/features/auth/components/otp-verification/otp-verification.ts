
// src/app/features/auth/components/otp-verification/otp-verification.component.ts
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth';

@Component({
 selector: 'app-otp-verification',
  standalone: false,
  templateUrl: './otp-verification.html',
  styleUrl: './otp-verification.scss',
})
export class OtpVerification implements OnInit {
  @Input() email: string = '';
  @Output() verified = new EventEmitter<void>();

  otpForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';
  resendCountdown = 0;
  private countdownInterval: any;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.startResendCountdown();
  }

  private initForm(): void {
    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]]
    });
  }

  private startResendCountdown(): void {
    this.resendCountdown = 60;
    this.countdownInterval = setInterval(() => {
      this.resendCountdown--;
      if (this.resendCountdown <= 0) {
        clearInterval(this.countdownInterval);
      }
    }, 1000);
  }

  onOtpInput(event: any): void {
    const value = event.target.value;
    // Auto-submit when 6 digits entered
    if (value.length === 6) {
      this.verifyOtp();
    }
  }

  verifyOtp(): void {
    if (this.otpForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const otp = this.otpForm.value.otp;

    this.authService.verifyOTP(this.email, otp).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Email verified successfully!';
        setTimeout(() => {
          this.verified.emit();
        }, 1500);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Invalid OTP. Please try again.';
        this.otpForm.reset();
      }
    });
  }

  resendOtp(): void {
    if (this.resendCountdown > 0) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.resendOTP(this.email).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'OTP resent successfully!';
        this.startResendCountdown();
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.message || 'Failed to resend OTP. Please try again.';
      }
    });
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }
}
