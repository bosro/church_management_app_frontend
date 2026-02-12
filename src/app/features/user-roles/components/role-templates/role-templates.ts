
// src/app/features/user-roles/components/role-templates/role-templates.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RoleTemplate, Permission } from '../../../../models/user-role.model';
import { UserRolesService } from '../../services/user-roles';

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
  errorMessage = '';
  successMessage = '';

  // Modal
  showCreateModal = false;
  showEditModal = false;
  templateForm!: FormGroup;
  selectedTemplate: RoleTemplate | null = null;
  selectedPermissions: Set<string> = new Set();

  constructor(
    private fb: FormBuilder,
    private userRolesService: UserRolesService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadRoleTemplates();
    this.loadAvailablePermissions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.templateForm = this.fb.group({
      role_name: ['', [Validators.required, Validators.minLength(3)]],
      description: ['']
    });
  }

  private loadRoleTemplates(): void {
    this.loading = true;

    this.userRolesService.getRoleTemplates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (templates) => {
          this.roleTemplates = templates;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading role templates:', error);
          this.loading = false;
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
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
    this.templateForm.reset();
    this.selectedPermissions.clear();
  }

  openEditModal(template: RoleTemplate): void {
    this.selectedTemplate = template;
    this.showEditModal = true;
    this.templateForm.patchValue({
      role_name: template.role_name,
      description: template.description
    });
    this.selectedPermissions = new Set(template.permissions || []);
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedTemplate = null;
    this.templateForm.reset();
    this.selectedPermissions.clear();
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
    const allSelected = categoryPermissions.every(p => this.selectedPermissions.has(p.name));

    if (allSelected) {
      categoryPermissions.forEach(p => this.selectedPermissions.delete(p.name));
    } else {
      categoryPermissions.forEach(p => this.selectedPermissions.add(p.name));
    }
  }

  isCategoryFullySelected(category: string): boolean {
    const categoryPermissions = this.permissionsByCategory[category];
    return categoryPermissions.every(p => this.selectedPermissions.has(p.name));
  }

  // CRUD Operations
  createTemplate(): void {
    if (this.templateForm.invalid) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    const templateData = {
      role_name: this.templateForm.value.role_name,
      description: this.templateForm.value.description,
      permissions: Array.from(this.selectedPermissions)
    };

    this.userRolesService.createRoleTemplate(templateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template created successfully!';
          this.loadRoleTemplates();
          this.closeCreateModal();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to create role template';
        }
      });
  }

  updateTemplate(): void {
    if (!this.selectedTemplate || this.templateForm.invalid) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    const templateData = {
      role_name: this.templateForm.value.role_name,
      description: this.templateForm.value.description,
      permissions: Array.from(this.selectedPermissions)
    };

    this.userRolesService.updateRoleTemplate(this.selectedTemplate.id, templateData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = 'Role template updated successfully!';
          this.loadRoleTemplates();
          this.closeEditModal();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to update role template';
        }
      });
  }

  deleteTemplate(templateId: string, event: Event): void {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this role template?')) {
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
          }
        });
    }
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
}
