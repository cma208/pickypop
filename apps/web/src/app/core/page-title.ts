import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

const APP_NAME = 'Pickypop';

/**
 * The browser tab says which screen you are on, then the shop.
 *
 * Worth the twenty lines: the owner keeps several tabs open at once, and
 * "Pickypop" four times over tells him nothing about which is which.
 */
@Injectable()
export class PageTitle extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const screen = this.buildTitle(snapshot);
    this.title.setTitle(screen ? `${screen} · ${APP_NAME}` : APP_NAME);
  }
}
