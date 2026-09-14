import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayout implements OnInit, OnDestroy {

  readonly auth = inject(AuthService);

  private readonly router = inject(Router);

  readonly sidebarOpen = signal(false);

  readonly week = signal<any>(null);


  private readonly weekUpdatedHandler = () => {
    void this.refreshWeek();
  };


  async ngOnInit(): Promise<void> {

    await this.refreshWeek();

    window.addEventListener(
      'nvk:week-updated',
      this.weekUpdatedHandler
    );

  }


  ngOnDestroy(): void {

    window.removeEventListener(
      'nvk:week-updated',
      this.weekUpdatedHandler
    );

  }


  async refreshWeek(): Promise<void> {

    try {

      const data =
        await window.nvkAPI.dashboard(
          this.auth.token()
        );

      if (data?.ok) {
        this.week.set(data.week);
      }

    } catch (error) {

      console.error(
        'Error actualizando semana:',
        error
      );

    }

  }


  has(p: string): boolean {
    return this.auth.has(p);
  }


  toggleSidebar(): void {
    this.sidebarOpen.update(
      v => !v
    );
  }


  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }


  async logout(): Promise<void> {

    await this.auth.logout();

    await this.router.navigateByUrl(
      '/login'
    );

  }

}