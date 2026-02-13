// src/app/core/services/sidebar.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  private sidebarOpenSubject = new BehaviorSubject<boolean>(false);
  public sidebarOpen$: Observable<boolean> = this.sidebarOpenSubject.asObservable();

  toggle(): void {
    this.sidebarOpenSubject.next(!this.sidebarOpenSubject.value);
  }

  open(): void {
    this.sidebarOpenSubject.next(true);
  }

  close(): void {
    this.sidebarOpenSubject.next(false);
  }

  get isOpen(): boolean {
    return this.sidebarOpenSubject.value;
  }
}
