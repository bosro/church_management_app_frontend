
// src/app/features/members/components/ghana-card-upload/ghana-card-upload.ts
// Front + back Ghana Card picker used by Add Member and Edit Member.
// It only collects the files; the parent saves them after the member is saved.
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { MemberService } from '../../services/member.service';

export interface IdCardSelection {
  frontFile: File | null;
  backFile: File | null;
  removeFront: boolean;
  removeBack: boolean;
}

@Component({
  selector: 'app-ghana-card-upload',
  standalone: false,
  templateUrl: './ghana-card-upload.html',
  styleUrl: './ghana-card-upload.scss',
})
export class GhanaCardUpload implements OnChanges, OnDestroy {
  /** Saved storage paths (edit mode) */
  @Input() frontPath: string | null | undefined = null;
  @Input() backPath: string | null | undefined = null;
  @Input() disabled = false;
  @Output() changed = new EventEmitter<IdCardSelection>();

  sel: IdCardSelection = { frontFile: null, backFile: null, removeFront: false, removeBack: false };
  preview: { front: string | null; back: string | null } = { front: null, back: null };
  saved: { front: string | null; back: string | null } = { front: null, back: null };
  error = '';

  constructor(private memberService: MemberService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['frontPath']) this.loadSaved('front', this.frontPath);
    if (ch['backPath']) this.loadSaved('back', this.backPath);
  }

  ngOnDestroy(): void {
    this.revoke('front');
    this.revoke('back');
  }

  private async loadSaved(side: 'front' | 'back', path?: string | null): Promise<void> {
    this.saved[side] = path ? await this.memberService.getIdCardUrl(path) : null;
  }

  private revoke(side: 'front' | 'back'): void {
    const u = this.preview[side];
    if (u) URL.revokeObjectURL(u);
    this.preview[side] = null;
  }

  shown(side: 'front' | 'back'): string | null {
    if (this.preview[side]) return this.preview[side];
    const removed = side === 'front' ? this.sel.removeFront : this.sel.removeBack;
    return removed ? null : this.saved[side];
  }

  onPick(side: 'front' | 'back', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.error = 'Please choose a JPG, PNG or WEBP image.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = 'Image must be smaller than 5MB.';
      return;
    }
    this.error = '';
    this.revoke(side);
    this.preview[side] = URL.createObjectURL(file);
    if (side === 'front') { this.sel.frontFile = file; this.sel.removeFront = false; }
    else { this.sel.backFile = file; this.sel.removeBack = false; }
    this.changed.emit({ ...this.sel });
  }

  remove(side: 'front' | 'back'): void {
    this.revoke(side);
    if (side === 'front') { this.sel.frontFile = null; this.sel.removeFront = !!this.frontPath; }
    else { this.sel.backFile = null; this.sel.removeBack = !!this.backPath; }
    this.changed.emit({ ...this.sel });
  }
}