// src/app/features/user-roles/components/role-templates/role-templates.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  RoleTemplate,
  Permission,
  RoleTemplateCreateInput,
  RoleTemplateUpdateInput
} from '../../../../models/user-role.model';
import { UserRolesService } from '../../services/user-roles';
import { AuthService } from '../../../../core/services/auth';

@Component({
  selector: 'app-role-templates',
  standalone: false,
  templateUrl: './role-templates.html',
  styleUrl: './role-templates.scss',
})
export class RoleTemplates implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  roleTemplates: RoleTemplate[] = [];
  availablePermissions: Permission[] = [];
  permissionsByCategory: Record<string, Permission[]> = {};

  loading = false;
  submitting = false;
  errorMessage = '';
  successMessage = '';

  // Modal
  showCreateModal = false;
  showEditModal = false;
  templateForm!: FormGroup;
  selectedTemplate: RoleTemplate | null = null;
  selectedPermissions: Set<string> = new Set();

  // Permissions
  canManageRoles = false;

  constructor(
    private fb: FormBuilder,
    private userRolesService: UserRolesService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.initForm();
    this.loadRoleTemplates();
    this.loadAvailablePermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageRoles = this.userRolesService.canManageRoles();

    if (!this.canManageRoles) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private initForm(): void {
    this.templateForm = this.fb.group({
      role_name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      description: ['', [Validators.maxLength(200)]]
    });
  }

  private loadRoleTemplates(): void {
    this.loading = true;
    this.errorMessage = '';

    this.userRolesService.getRoleTemplates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (templates) => {
          this.roleTemplates = templates;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load role templates';
          this.loading = false;
          console.error('Error loading role templates:', error);
        }
      });
  }

  private loadAvailablePermissions(): void {
    this.availablePermissions = this.userRolesService.getAvailablePermissions();
    this.permissionsByCategory = this.userRolesService.getPermissionsByCategory();
  }

  // Modal Management
  openCreateModal(): void {
    this.showCreateModal = true;
    this.templateForm.reset();
    this.selectedPermissions.clear();
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    if (this.submitting) return;

    this.showCreateModal = false;
    this.templateForm.reset();
    this.selectedPermissions.clear();
    this.errorMessage = '';
  }

  openEditModal(template: RoleTemplate): void {
    this.selectedTemplate = template;
    this.showEditModal = true;
    this.templateForm.patchValue({
      role_name: template.role_name,
      description: template.description || ''
    });
    this.selectedPermissions = new Set(template.permissions || []);
    this.errorMessage = '';
  }

  closeEditModal(): void {
    if (this.submitting) return;

    this.showEditModal = false;
    this.selectedTemplate = null;
    this.templateForm.reset();
    this.selectedPermissions.clear();
    this.errorMessage = '';
  }

  // Permission Selection
  togglePermission(permissionName: string): void {
    if (this.selectedPermissions.has(permissionName)) {
      this.selectedPermissions.delete(permissionName);
    } else {
      this.selectedPermissions.add(permissionName);
    }
  }

  toggleCategoryPermissions(category: string): void {
    const categoryPermissions = this.permissionsByCategory[category];
    if (!categoryPermissions) return;

    const allSelected = categoryPermissions.every(p => this.selectedPermissions.has(p.name));

    if (allSelected) {
      categoryPermissions.forEach(p => this.selectedPermissions.delete(p.name));
    } else {
      categoryPermissions.forEach(p => this.selectedPermissions.add(p.name));
    }
  }

  isCategoryFullySelected(category: string): boolean {
    const categoryPermissions = this.permissionsByCategory[category];
    if (!categoryPermissions || categoryPermissions.length === 0) return false;
    return categoryPermissions.every(p => this.selectedPermissions.has(p.name));
  }

  // CRUD Operations
  createTemplate(): void {
    if (this.templateForm.invalid) {
      this.markFormGroupTouched(this.templateForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    if (this.selectedPermissions.size === 0) {
      this.errorMessage = 'Please select at least one permission';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const templateData: RoleTemplateCreateInput = {
      role_name: this.templateForm.value.role_name.trim(),
      description: this.templateForm.value.description?.trim() || undefined,
      permissions: Array.from(this.selectedPermissions)
    };

    // Validate permissions
    if (!this.userRolesService.validatePermissions(templateData.permissions)) {
      this.submitting = false;
      this.errorMessage = 'Some selected permissions are invalid';
      return;
    }

    this.userRolesService.createRoleTemplate(templateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template created successfully!';
          this.loadRoleTemplates();
          this.closeCreateModal();
          this.submitting = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create role template';
          this.submitting = false;
        }
      });
  }

  updateTemplate(): void {
    if (!this.selectedTemplate) {
      this.errorMessage = 'No template selected';
      return;
    }

    if (this.templateForm.invalid) {
      this.markFormGroupTouched(this.templateForm);
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    if (this.selectedPermissions.size === 0) {
      this.errorMessage = 'Please select at least one permission';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    const templateData: RoleTemplateUpdateInput = {
      role_name: this.templateForm.value.role_name.trim(),
      description: this.templateForm.value.description?.trim() || undefined,
      permissions: Array.from(this.selectedPermissions)
    };

    // Validate permissions
    if (!this.userRolesService.validatePermissions(templateData.permissions)) {
      this.submitting = false;
      this.errorMessage = 'Some selected permissions are invalid';
      return;
    }

    this.userRolesService.updateRoleTemplate(this.selectedTemplate.id, templateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template updated successfully!';
          this.loadRoleTemplates();
          this.closeEditModal();
          this.submitting = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update role template';
          this.submitting = false;
        }
      });
  }

  deleteTemplate(templateId: string, event: Event): void {
    event.stopPropagation();

    const confirmMessage = 'Are you sure you want to delete this role template? This action cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    this.userRolesService.deleteRoleTemplate(templateId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template deleted successfully!';
          this.loadRoleTemplates();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete role template';
          console.error('Error deleting template:', error);
        }
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/user-roles']);
  }

  // Helper Methods
  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      members: 'ri-group-line',
      attendance: 'ri-calendar-check-line',
      finance: 'ri-money-dollar-circle-line',
      ministries: 'ri-service-line',
      events: 'ri-calendar-event-line',
      communications: 'ri-message-3-line',
      forms: 'ri-file-list-3-line',
      branches: 'ri-building-line',
      sermons: 'ri-volume-up-line',
      settings: 'ri-settings-3-line',
      users: 'ri-user-settings-line'
    };
    return icons[category] || 'ri-shield-line';
  }

  getCategoryLabel(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
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

  getFormError(fieldName: string): string {
    const control = this.templateForm.get(fieldName);

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

  getSelectedCount(categoryKey: string): number {
  const categoryPermissions = this.permissionsByCategory[categoryKey];
  if (!categoryPermissions) return 0;

  return categoryPermissions.filter(p =>
    this.selectedPermissions.has(p.name)
  ).length;
}


  clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}
