// src/app/features/communications/components/create-communication/create-communication.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommunicationsService } from '../../../services/communications';
import { CommunicationType, TargetAudience } from '../../../../../models/communication.model';

interface MessageTemplate {
  name: string;
  message: string;
}

@Component({
  selector: 'app-create-communication',
  standalone: false,
  templateUrl: './create-communication.html',
  styleUrl: './create-communication.scss',
})
export class CreateCommunication implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Expose Math to template
  Math = Math;

  communicationForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  communicationTypes: { value: CommunicationType; label: string }[] = [
    { value: 'sms', label: 'SMS Only' },
    { value: 'email', label: 'Email Only' },
    { value: 'both', label: 'SMS & Email' }
  ];

  targetAudiences: { value: TargetAudience; label: string }[] = [
    { value: 'all', label: 'All Members' },
    { value: 'members', label: 'Active Members' },
    { value: 'groups', label: 'Specific Groups' },
    { value: 'custom', label: 'Custom List' }
  ];

  messageTemplates: MessageTemplate[] = [
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
    },
    {
      name: 'Weekly Newsletter',
      message: 'This week at church: {event_name}. Join us as we grow together in faith. See you there!'
    },
    {
      name: 'Prayer Request Response',
      message: 'Dear {name}, we are praying for you. Remember that God is with you always.'
    }
  ];

  // Permissions
  canManageCommunications = false;

  constructor(
    private fb: FormBuilder,
    private communicationsService: CommunicationsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageCommunications = this.communicationsService.canManageCommunications();

    if (!this.canManageCommunications) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.communicationForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
      communication_type: ['sms' as CommunicationType, [Validators.required]],
      target_audience: ['all' as TargetAudience, [Validators.required]],
      scheduled_at: ['']
    });

    // Watch for communication type changes to show SMS warnings
    this.communicationForm.get('communication_type')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.validateMessageLength();
      });

    this.communicationForm.get('message')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.validateMessageLength();
      });
  }

  private validateMessageLength(): void {
    const type = this.communicationForm.get('communication_type')?.value;
    const message = this.communicationForm.get('message')?.value || '';

    // Warn if SMS is very long
    if ((type === 'sms' || type === 'both') && message.length > 480) {
      // 480 chars = ~3 SMS messages
      console.warn('SMS message is quite long and may be expensive');
    }
  }

  applyTemplate(template: MessageTemplate): void {
    this.communicationForm.patchValue({
      title: template.name,
      message: template.message
    });
  }

  onSubmit(): void {
    if (this.communicationForm.invalid) {
      this.markFormGroupTouched(this.communicationForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      this.scrollToTop();
      return;
    }

    // Validate scheduled date if provided
    if (this.communicationForm.value.scheduled_at) {
      const scheduledDate = new Date(this.communicationForm.value.scheduled_at);
      const now = new Date();

      if (scheduledDate <= now) {
        this.errorMessage = 'Scheduled date must be in the future';
        this.scrollToTop();
        return;
      }
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const communicationData = {
      title: this.communicationForm.value.title.trim(),
      message: this.communicationForm.value.message.trim(),
      communication_type: this.communicationForm.value.communication_type,
      target_audience: this.communicationForm.value.target_audience,
      scheduled_at: this.communicationForm.value.scheduled_at || undefined
    };

    this.communicationsService
      .createCommunication(communicationData)
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
          this.scrollToTop();
          console.error('Error creating communication:', error);
        }
      });
  }

  private sendCommunication(communicationId: string): void {
    this.communicationsService
      .sendCommunication(communicationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Communication sent successfully!';
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['main/communications']);
          }, 1500);
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = error.message || 'Failed to send communication';
          this.scrollToTop();
          console.error('Send error:', error);
        }
      });
  }

  cancel(): void {
    if (this.communicationForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['main/communications']);
      }
    } else {
      this.router.navigate(['main/communications']);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.communicationForm.get(fieldName);

    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('minlength')) {
      const minLength = control.getError('minlength').requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (control.hasError('maxlength')) {
      const maxLength = control.getError('maxlength').requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }

    return 'Invalid input';
  }

  getCharacterCount(): number {
    return this.communicationForm.get('message')?.value?.length || 0;
  }

  getSmsSegmentCount(): number {
    const message = this.communicationForm.get('message')?.value || '';
    return this.communicationsService.estimateSmsCount(message);
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
