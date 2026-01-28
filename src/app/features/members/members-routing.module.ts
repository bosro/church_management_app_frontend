// src/app/features/members/members-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MemberList } from './components/member-list/member-list';
import { AddMember } from './components/add-member/add-member';
import { EditMember } from './components/edit-member/edit-member';
import { ImportMembers } from './components/import-members/import-members';
import { MemberDetail } from './components/member-detail/member-detail';


const routes: Routes = [
  { path: '', component: MemberList },
  { path: 'add', component: AddMember },
  { path: 'import', component: ImportMembers },
  { path: ':id', component: MemberDetail },
  { path: ':id/edit', component: EditMember }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MembersRoutingModule { }
