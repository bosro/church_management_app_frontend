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

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
  ) {}

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
        this.pageState = 'success';
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
    this.loadEvent(); // refresh spots left
  }
}
