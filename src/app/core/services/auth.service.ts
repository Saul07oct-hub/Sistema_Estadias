import { Injectable, computed, signal } from '@angular/core';
import { NvkUser } from '../models/api.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<NvkUser | null>(null);
  private readonly _token = signal('');
  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly loggedIn = computed(() => !!this._user() && !!this._token());

  setSession(user: NvkUser, token: string): void {
    this._user.set(user);
    this._token.set(token);
  }

  has(permission: string): boolean {
    return this._user()?.permisos.includes(permission) ?? false;
  }

  async logout(): Promise<void> {
    const token = this._token();
    if (token && window.nvkAPI) await window.nvkAPI.logout(token);
    this._user.set(null);
    this._token.set('');
  }
}
