import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPermissionError } from '../../core/friendly-error';
import { CurrentWorkspace } from '../../core/workspace';
import { fakeWorkspace } from '../../core/workspace.testing';
import { CuentasPage } from './cuentas.page';
import { FinanzasData, type AccountSummary } from './finanzas.data';

const YAPE: AccountSummary = {
  id: 'acc-yape',
  name: 'Yape',
  kind: 'wallet',
  active: true,
  openingBalance: 0,
  openingBalanceOn: '2026-09-01',
  defaultPaymentMethod: 'yape',
  note: null,
  updatedAt: '2026-09-01T15:00:00+00:00',
  totalIn: 0,
  totalOut: 0,
  balance: 0,
  movements: 0,
  lastMovementAt: null,
  movementsBeforeOpening: 0,
  netBeforeOpening: 0,
};

/** What the row policy of `accounts` answers to a member who is no longer owner (permisos.sql). */
const ROW_POLICY = { code: '42501', message: 'new row violates row-level security policy for table "accounts"' };

async function settle(fixture: ComponentFixture<CuentasPage>): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const labels = (fixture: ComponentFixture<CuentasPage>) =>
  ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).map((button) => button.textContent?.trim());

describe('CuentasPage, an owner made operator from another tab (ADR-025)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the role again when switching an account off is refused, and stops offering it', async () => {
    const workspace = fakeWorkspace('owner');
    const afterRefusal = vi.fn(async (error: unknown) => {
      if (!isPermissionError(error)) return false;
      workspace.role.set('operator');
      return true;
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CurrentWorkspace, useValue: { ...workspace, afterRefusal } },
        {
          provide: FinanzasData,
          useValue: {
            accounts: async () => [YAPE],
            setAccountActive: async () => {
              throw ROW_POLICY;
            },
          },
        },
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = TestBed.createComponent(CuentasPage);
    await settle(fixture);

    const off = ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find(
      (button) => button.textContent?.trim() === 'Desactivar',
    )!;
    off.click();
    await settle(fixture);

    expect(afterRefusal).toHaveBeenCalledWith(ROW_POLICY);
    expect(labels(fixture)).not.toContain('Desactivar');
    expect(labels(fixture)).not.toContain('Editar');
    expect(fixture.nativeElement.querySelector('.alert')?.textContent).toContain('No tienes permiso');
  });
});
