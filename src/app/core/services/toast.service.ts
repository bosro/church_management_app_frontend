// src/app/core/services/toast.service.ts
// Small app-wide toasts. A "progress" toast shows a live bar and is updated in place by id.
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'progress';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** 0-100, only for kind 'progress' */
  percent?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this._toasts.asObservable();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private seq = 0;

  success(title: string, message?: string, ms = 5000): string { return this.add('success', title, message, ms); }
  error(title: string, message?: string, ms = 8000): string { return this.add('error', title, message, ms); }
  warning(title: string, message?: string, ms = 7000): string { return this.add('warning', title, message, ms); }
  info(title: string, message?: string, ms = 5000): string { return this.add('info', title, message, ms); }

  /** Create or update a progress toast (stays until you call finish/dismiss). */
  progress(id: string, title: string, percent: number, message?: string): void {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    this.clearTimer(id);
    const list = this._toasts.value;
    const i = list.findIndex((t) => t.id === id);
    const toast: Toast = { id, kind: 'progress', title, message, percent: p };
    this._toasts.next(i >= 0 ? list.map((t, k) => (k === i ? toast : t)) : [...list, toast]);
  }

  /** Turn a progress toast into a normal one (e.g. "Done"), which then auto-dismisses. */
  finish(id: string, kind: Exclude<ToastKind, 'progress'>, title: string, message?: string, ms = 6000): void {
    this.clearTimer(id);
    const list = this._toasts.value;
    const toast: Toast = { id, kind, title, message };
    const i = list.findIndex((t) => t.id === id);
    this._toasts.next(i >= 0 ? list.map((t, k) => (k === i ? toast : t)) : [...list, toast]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this._toasts.next(this._toasts.value.filter((t) => t.id !== id));
  }

  private add(kind: ToastKind, title: string, message: string | undefined, ms: number): string {
    const id = `t${++this.seq}`;
    this._toasts.next([...this._toasts.value, { id, kind, title, message }]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
    return id;
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }
}
