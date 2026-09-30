import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Session } from './core/session';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly session = inject(Session);

  constructor() {
    void this.session.restore();
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/login']);
  }
}
