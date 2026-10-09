import { Component, inject, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Session } from '../../core/session';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  // The local test account fills itself in only while developing: the
  // published page shows the fields empty.
  protected readonly email = signal(isDevMode() ? 'dev@pickypop.test' : '');
  protected readonly password = signal(isDevMode() ? 'pickypop123' : '');
  protected readonly busy = this.session.busy;
  protected readonly error = this.session.error;

  protected async submit(): Promise<void> {
    if (await this.session.signIn(this.email(), this.password())) {
      await this.router.navigate(['/hoy']);
    }
  }
}
