// src/app/features/auth/components/signin/signin.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-signin',
  standalone: false,
  templateUrl: './signin.html',
  styleUrl: './signin.scss',
})
export class Signin implements OnInit {
  signinForm!: FormGroup;
  loading = false;
  errorMessage = '';
  returnUrl = '';
  rememberMe = false;
  showPassword = false;

  testimonials = [
    {
      quote:
        'Churchman transformed how we track attendance and giving — a true blessing!',
      author: 'Grace Chapel, Accra',
    },
    {
      quote:
        "Managing 3 branches used to be chaos. Now it's seamless and stress-free.",
      author: 'Redeemed Life Church, Kumasi',
    },
    {
      quote:
        'Our pastors spend less time on admin and more time with the congregation.',
      author: 'Fountain of Life Ministry',
    },
    {
      quote:
        'Member records, events, finances — all in one place. Absolutely incredible.',
      author: 'Christ Embassy, Tema',
    },
    {
      quote: 'The best investment our church leadership has made this decade.',
      author: 'Living Waters Assembly',
    },
    {
      quote:
        'We onboarded 500 members in a week. The platform is fast and intuitive.',
      author: 'Victory Worship Centre',
    },
  ];

  activeIndex = 0;
  exitingIndex = -1;
  private testimonialTimer: any;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.returnUrl =
      this.route.snapshot.queryParams['returnUrl'] || 'main/dashboard';
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      this.signinForm.patchValue({ email: savedEmail });
      this.rememberMe = true;
    }
    this.startTestimonialCycle();
  }

  private startTestimonialCycle(): void {
    this.testimonialTimer = setInterval(() => {
      this.exitingIndex = this.activeIndex;
      setTimeout(() => {
        this.exitingIndex = -1;
        this.activeIndex = (this.activeIndex + 1) % this.testimonials.length;
      }, 500);
    }, 4500);
  }

  ngOnDestroy(): void {
    if (this.testimonialTimer) clearInterval(this.testimonialTimer);
  }

  private initForm(): void {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.signinForm.invalid) {
      this.markFormGroupTouched(this.signinForm);
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.signinForm.value;

    this.authService.signIn(email, password).subscribe({
      next: (response) => {
        // Handle remember me
        if (this.rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        // Navigate to return URL or dashboard
        this.router.navigate([this.returnUrl]);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.message || 'Invalid email or password. Please try again.';
      },
    });
  }

  signInWithGoogle(): void {
    this.authService.signInWithGoogle().subscribe({
      next: () => {
        // Google will redirect
      },
      error: (error) => {
        this.errorMessage = 'Failed to sign in with Google. Please try again.';
      },
    });
  }

  toggleRememberMe(): void {
    this.rememberMe = !this.rememberMe;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.signinForm.get(fieldName);
    if (control?.hasError('required')) {
      return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`;
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control?.hasError('minlength')) {
      return 'Password must be at least 6 characters';
    }
    return '';
  }
}



