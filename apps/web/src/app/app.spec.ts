import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the root component', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hands the page over to the router', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    // The root only hosts the outlet: the shell and the login page own the UI.
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
