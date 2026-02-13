import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sidebar } from './components/sidebar/sidebar';
import { Header } from './components/header/header';
import { Loading } from './components/loading/loading';
import { Modal } from './components/modal/modal';
import { Table } from './components/table/table';
import { Card } from './components/card/card';
import { Button } from './components/button/button';
import { InputComponent } from './components/input/input';
import { Chart } from './components/chart/chart';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Unauthorized } from './components/unauthorized/unauthorized';

@NgModule({
  declarations: [
    Sidebar,
    Header,
    Loading,
    Modal,
    Table,
    Card,
    Button,
    InputComponent,
    Chart,
    Unauthorized,
  ],
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  exports: [
    Sidebar,
    Header,
    Loading,
    Modal,
    Table,
    Card,
    Button,
    InputComponent,
    Chart,
    ReactiveFormsModule,
    FormsModule,
  ],
})
export class SharedModule {}
