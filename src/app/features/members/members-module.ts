import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MemberList } from './components/member-list/member-list';
import { MemberDetail } from './components/member-detail/member-detail';
import { AddMember } from './components/add-member/add-member';
import { ImportMembers } from './components/import-members/import-members';
import { MemberProfile } from './components/member-profile/member-profile';
import { MembersRoutingModule } from './members-routing.module';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared-module';
import { EditMember } from './components/edit-member/edit-member';
import { RegistrationLinks } from './components/registration-links/registration-links';
import { QrCodeComponent } from 'ng-qrcode';

@NgModule({
  declarations: [
    MemberList,
    MemberDetail,
    AddMember,
    ImportMembers,
    MemberProfile,
    EditMember,
    RegistrationLinks,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedModule,
    MembersRoutingModule,
    QrCodeComponent,
  ],
})
export class MembersModule {}
