import { RouterModule, Routes } from "@angular/router";
import { CellsList } from "./cells-list/cells-list";
import { NgModule } from "@angular/core";
import { RoleGuard } from "../../core/guards/role-guard";

const routes: Routes = [
  { path: '', component: CellsList },
   {
      path: '',
      component: CellsList,
      canActivate: [ RoleGuard],
      data: {
        title: 'Branches',
        breadcrumb: 'Branches',
        roles: ['super_admin', 'church_admin', 'pastor', 'ministry_leader', 'secretary']
      }
    },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CellRoutingModule { }
