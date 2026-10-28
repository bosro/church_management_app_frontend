// src/app/features/communications/components/sender-id/sender-id.ts
// Church-facing page: "SMS Sender ID" — see what recipients see, request your own name.
// Route: /main/communications/sender-id
import { Component, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import {
  MySenderInfo,
  SenderIdRequest,
  SenderIdService,
  SenderRequestStatus,
} from '../../../../core/services/sender-id.service';

@Component({
  selector: 'app-sender-id',
  standalone: false,
  templateUrl: './sender-id.html',
  styleUrl: './sender-id.scss',
})
export class SenderIdPage implements OnInit {
  loading = true;
  submitting = false;
  working = false;
  errorMessage = '';
  successMessage = '';

  info: MySenderInfo | null = null;
  requests: SenderIdRequest[] = [];

  // form
  senderId = '';
  notes = '';
  touched = false;

  constructor(
    private senderService: SenderIdService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const [info, requests] = await Promise.all([
        this.senderService.getMyInfo(),
        this.senderService.getMyRequests().catch(() => [] as SenderIdRequest[]),
      ]);
      this.info = info;
      this.requests = requests;
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not load your sender ID details.';
    } finally {
      this.loading = false;
    }
  }

  get usingOwn(): boolean {
    return !!this.info?.current_sender_id;
  }

  get normalized(): string {
    return this.senderId.trim().replace(/\s+/g, ' ');
  }

  get validationError(): string | null {
    if (!this.touched && !this.senderId) return null;
    return SenderIdService.validate(this.senderId);
  }

  get canSubmit(): boolean {
    return !this.submitting && !SenderIdService.validate(this.senderId);
  }

  /** What the phone preview shows while typing */
  get previewName(): string {
    return this.normalized || this.info?.effective_sender_id || 'CHURCHMAN';
  }

  async submit(): Promise<void> {
    this.touched = true;
    this.errorMessage = '';
    if (!this.canSubmit) return;

    this.submitting = true;
    try {
      await this.senderService.submitRequest(this.normalized, this.notes);
      this.senderId = '';
      this.notes = '';
      this.touched = false;
      this.flash('Request sent. We will let you know by email once it is reviewed.');
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not send the request.';
    } finally {
      this.submitting = false;
    }
  }

  async cancel(req: { id: string }): Promise<void> {
    if (!confirm('Cancel this sender ID request?')) return;
    this.working = true;
    this.errorMessage = '';
    try {
      await this.senderService.cancelRequest(req.id);
      this.flash('Request cancelled.');
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not cancel the request.';
    } finally {
      this.working = false;
    }
  }

  async useDefault(): Promise<void> {
    const def = this.info?.default_sender_id || 'the default sender';
    if (!confirm(`Stop using "${this.info?.current_sender_id}" and send as "${def}" again? You would need a new request to get it back.`)) return;
    this.working = true;
    this.errorMessage = '';
    try {
      await this.senderService.resetToDefault();
      this.flash(`Switched back to ${def}.`);
      await this.load();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not switch back to the default.';
    } finally {
      this.working = false;
    }
  }

  statusLabel(s: SenderRequestStatus): string {
    return {
      pending: 'Waiting for review',
      processing: 'In progress',
      approved: 'Approved',
      rejected: 'Not approved',
      cancelled: 'Cancelled',
    }[s];
  }

  goBack(): void {
    this.location.back();
  }

  private flash(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 6000);
  }
}
