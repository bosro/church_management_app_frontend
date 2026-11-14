// src/app/features/public/event-registration/event-registration.ts
// Public (no login) event registration page: /public/event-register/:eventId
// Talks to the database ONLY through two SECURITY DEFINER functions:
//   get_public_event(p_event_id)  and  register_for_event_public(...)
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

type PageState = 'loading' | 'notfound' | 'closed' | 'form' | 'success';

interface PublicEvent {
  found: boolean;
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  banner_url?: string | null;
  flyer_url?: string | null;
  registration_required: boolean;
  registration_deadline?: string | null;
  max_attendees?: number | null;
  spots_left?: number | null;
  is_full: boolean;
  registration_open: boolean;
  closed_reason?: string | null;
  church_name?: string | null;
  church_logo?: string | null;
  sms_confirmation?: boolean;
}

@Component({
  selector: 'app-public-event-registration',
  standalone: false,
  templateUrl: './event-registration.html',
  styleUrl: './event-registration.scss',
})
export class PublicEventRegistration implements OnInit {
  eventId = '';
  event: PublicEvent | null = null;
  pageState: PageState = 'loading';

  // Form fields
  name = '';
  email = '';
  phone = '';
  notes = '';

  submitting = false;
  errorMessage = '';


  registrationCode = '';
  smsPending = false;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') || '';
    this.loadEvent();
  }

  get heroImage(): string | null {
    return this.event?.banner_url || this.event?.flyer_url || null;
  }

  async loadEvent(): Promise<void> {
    this.pageState = 'loading';
    if (!this.eventId) {
      this.pageState = 'notfound';
      return;
    }
    try {
      const { data, error } = await this.supabase.client.rpc('get_public_event', {
        p_event_id: this.eventId,
      });
      if (error || !data || !data.found) {
        this.pageState = 'notfound';
      } else {
        this.event = data as PublicEvent;
        this.pageState = this.event.registration_open ? 'form' : 'closed';
      }
    } catch {
      this.pageState = 'notfound';
    }
    this.cdr.detectChanges();
  }

  async submit(): Promise<void> {
    if (this.submitting || !this.event) return;
    this.errorMessage = '';

    if (!this.name.trim() || !this.email.trim()) {
      this.errorMessage = 'Please enter your name and email address.';
      return;
    }

    if (this.event.sms_confirmation && !this.phone.trim()) {
      this.errorMessage = 'Please enter your phone number so we can send your confirmation.';
      return;
    }

    this.submitting = true;
    try {
      const { data, error } = await this.supabase.client.rpc('register_for_event_public', {
        p_event_id: this.event.id,
        p_name: this.name,
        p_email: this.email,
        p_phone: this.phone || null,
        p_notes: this.notes || null,
      });

      if (error) {
        this.errorMessage = 'Could not complete registration. Please try again.';
      } else if (!data?.success) {
        this.errorMessage = data?.error || 'Could not complete registration.';
        // If the event filled up / closed meanwhile, refresh the page state
        if (/full|deadline|ended/i.test(this.errorMessage)) {
          await this.loadEvent();
        }
      } else {
        this.registrationCode = data.registration_code || '';
        this.smsPending = !!data.sms_pending;
        this.pageState = 'success';
        if (data.registration_id) {
          this.supabase.client.functions
            .invoke('send-event-registration-sms', { body: { registration_id: data.registration_id } })
            .then(({ data: d, error: e }) => {
              if (e || d?.success === false) console.warn('Confirmation SMS problem:', e?.message || d?.error || d?.status);
            })
            .catch((e) => console.warn('Confirmation SMS problem:', e));
        }
      }
    } catch {
      this.errorMessage = 'Network error. Please check your connection and try again.';
    } finally {
      this.submitting = false;
      this.cdr.detectChanges();
    }
  }

  registerAnother(): void {
    this.name = '';
    this.email = '';
    this.phone = '';
    this.notes = '';
    this.errorMessage = '';
    this.registrationCode = '';
    this.smsPending = false;
    this.loadEvent(); // refresh spots left
  }
}
