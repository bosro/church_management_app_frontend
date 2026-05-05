import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { currentAcademicYear, generateAcademicYears } from '../../../models/school.model';

@Injectable({ providedIn: 'root' })
export class FeedingFilterService {
  private readonly TERM_KEY = 'churchman_feeding_term';
  private readonly YEAR_KEY = 'churchman_feeding_year';
  private readonly CONFIRMED_KEY = 'churchman_feeding_confirmed';

  private _term = new BehaviorSubject<string>(this._loadTerm());
  private _year = new BehaviorSubject<string>(this._loadYear());

  term$ = this._term.asObservable();
  year$ = this._year.asObservable();

  get term(): string { return this._term.value; }
  get year(): string { return this._year.value; }
  get isConfirmed(): boolean {
    return localStorage.getItem(this.CONFIRMED_KEY) === 'true';
  }

  setTerm(term: string): void {
    this._term.next(term);
    localStorage.setItem(this.TERM_KEY, term);
    localStorage.setItem(this.CONFIRMED_KEY, 'true');
  }

  setYear(year: string): void {
    this._year.next(year);
    localStorage.setItem(this.YEAR_KEY, year);
    localStorage.setItem(this.CONFIRMED_KEY, 'true');
  }

  setBoth(term: string, year: string): void {
    this._term.next(term);
    this._year.next(year);
    localStorage.setItem(this.TERM_KEY, term);
    localStorage.setItem(this.YEAR_KEY, year);
    localStorage.setItem(this.CONFIRMED_KEY, 'true');
  }

  private _loadTerm(): string {
    const saved = localStorage.getItem(this.TERM_KEY);
    if (saved) return saved;
    const defaultTerm = this._guessCurrentTerm();
    localStorage.setItem(this.TERM_KEY, defaultTerm); // persist default
    return defaultTerm;
  }

  private _loadYear(): string {
    const saved = localStorage.getItem(this.YEAR_KEY);
    const validYears = generateAcademicYears();
    if (saved && validYears.includes(saved)) return saved;
    const defaultYear = currentAcademicYear();
    localStorage.setItem(this.YEAR_KEY, defaultYear); // persist default
    return defaultYear;
  }

  private _guessCurrentTerm(): string {
    const month = new Date().getMonth() + 1;
    if (month >= 1 && month <= 4) return 'Term 1';
    if (month >= 5 && month <= 8) return 'Term 2';
    return 'Term 3';
  }
}
