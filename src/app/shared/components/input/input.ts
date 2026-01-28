

// src/app/shared/components/input/input.component.ts
import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: false,
  template: `
    <div class="input-wrapper">
      <label *ngIf="label" [for]="id" class="input-label">
        {{ label }}
        <span *ngIf="required" class="text-red-500">*</span>
      </label>

      <div class="input-container">
        <i *ngIf="icon" [class]="icon" class="input-icon"></i>

        <input
          [id]="id"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [value]="value"
          (input)="onInputChange($event)"
          (blur)="onTouched()"
          [class.has-icon]="icon"
          class="input-field"
        />

        <i
          *ngIf="type === 'password'"
          [class]="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'"
          class="password-toggle"
          (click)="togglePassword()"
        ></i>
      </div>

      <span *ngIf="error && touched" class="error-message">
        {{ error }}
      </span>
    </div>
  `,
  styles: [`
    .input-wrapper {
      margin-bottom: 1.5rem;
    }

    .input-label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .input-container {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-field {
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 15px;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      font-family: 'Nunito Sans', sans-serif;
      transition: all 0.2s;
      background: #F9FAFB;
    }

    .input-field.has-icon {
      padding-left: 2.75rem;
    }

    .input-field:focus {
      outline: none;
      border-color: #5B21B6;
      background: white;
      box-shadow: 0 0 0 3px rgba(91, 33, 182, 0.1);
    }

    .input-field:disabled {
      background: #F3F4F6;
      cursor: not-allowed;
    }

    .input-icon {
      position: absolute;
      left: 1rem;
      color: #9CA3AF;
      font-size: 18px;
      pointer-events: none;
    }

    .password-toggle {
      position: absolute;
      right: 1rem;
      color: #9CA3AF;
      font-size: 18px;
      cursor: pointer;
    }

    .password-toggle:hover {
      color: #5B21B6;
    }

    .error-message {
      display: block;
      margin-top: 0.5rem;
      font-size: 13px;
      color: #DC2626;
    }
  `],
    providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ]
})
export class InputComponent implements ControlValueAccessor {
  @Input() id: string = `input-${Math.random().toString(36).substr(2, 9)}`;
  @Input() label?: string;
  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() icon?: string;
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() error?: string;

  value: string = '';
  touched: boolean = false;
  showPassword: boolean = false;

  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: any): void {
    this.value = value || '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
    this.touched = true;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
    this.type = this.showPassword ? 'text' : 'password';
  }
}
