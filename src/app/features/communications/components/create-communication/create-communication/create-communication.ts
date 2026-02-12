
// src/app/features/communications/components/create-communication/create-communication.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../../services/communications';

@Component({
  selector: 'app-create-communication',
  standalone: false,
  templateUrl: './create-communication.html',
  styleUrl: './create-communication.scss',
})
export class CreateCommunication implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  Math!:Math

  communicationForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  communicationTypes = [
    { value: 'sms', label: 'SMS Only' },
    { value: 'email', label: 'Email Only' },
    { value: 'both', label: 'SMS & Email' }
  ];

  targetAudiences = [
    { value: 'all', label: 'All Members' },
    { value: 'members', label: 'Active Members' },
    { value: 'groups', label: 'Specific Groups' },
    { value: 'custom', label: 'Custom List' }
  ];

  messageTemplates = [
    {
      name: 'Service Reminder',
      message: 'Dear {name}, this is a reminder about our service on {date} at {time}. We look forward to seeing you!'
    },
    {
      name: 'Event Announcement',
      message: 'Exciting news! Join us for {event_name} on {date}. Register now to secure your spot.'
    },
    {
      name: 'Birthday Wishes',
      message: 'Happy Birthday {name}! May God bless you abundantly on this special day and always.'
    },
    {
      name: 'Offering Thank You',
      message: 'Thank you {name} for your generous offering of {amount}. Your support makes a difference!'
    }
  ];

  constructor(
    private fb: FormBuilder,
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.communicationForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      message: ['', [Validators.required, Validators.minLength(10)]],
      communication_type: ['sms', [Validators.required]],
      target_audience: ['all', [Validators.required]],
      scheduled_at: ['']
    });
  }

  applyTemplate(template: any): void {
    this.communicationForm.patchValue({
      title: template.name,
      message: template.message
    });
  }

  onSubmit(): void {
    if (this.communicationForm.invalid) {
      this.markFormGroupTouched(this.communicationForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const communicationData = {
      ...this.communicationForm.value,
      scheduled_at: this.communicationForm.value.scheduled_at || null
    };

    this.communicationsService.createCommunication(communicationData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (communication) => {
          this.successMessage = 'Communication created successfully!';

          // Auto-send if not scheduled
          if (!communicationData.scheduled_at) {
            this.sendCommunication(communication.id);
          } else {
            setTimeout(() => {
              this.router.navigate(['main/communications']);
            }, 1500);
          }
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to create communication. Please try again.';
        }
      });
  }

  private sendCommunication(communicationId: string): void {
    this.communicationsService.sendCommunication(communicationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Communication sent successfully!';
          setTimeout(() => {
            this.router.navigate(['main/communications']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to send communication';
        }
      });
  }

  cancel(): void {
    this.router.navigate(['main/communications']);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.communicationForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    return '';
  }

  getCharacterCount(): number {
    return this.communicationForm.get('message')?.value?.length || 0;
  }
}
