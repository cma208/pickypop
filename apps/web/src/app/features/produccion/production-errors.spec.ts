import { explainProductionError, NO_PRIVILEGE_MESSAGE, OUT_OF_SYNC_MESSAGE, productionProblem } from './production-errors';

const FALLBACK = 'No pudimos cerrar la impresión. No se movió nada; inténtalo de nuevo.';

describe('production errors', () => {
  it('asks to reload when the database does not have the function the screen calls', () => {
    // What PostgREST answers to a tab whose app is newer, or older, than the database.
    const error = {
      code: 'PGRST202',
      message: 'Could not find the function public.complete_print_job(p_expected_status, p_job_id, p_result) in the schema cache',
    };
    expect(explainProductionError(error, FALLBACK)).toBe(OUT_OF_SYNC_MESSAGE);
  });

  it('asks the same for a column the database does not have yet', () => {
    const error = { code: 'PGRST204', message: "Could not find the 'request_key' column of 'print_jobs' in the schema cache" };
    expect(explainProductionError(error, FALLBACK)).toBe(OUT_OF_SYNC_MESSAGE);
  });

  it('says a refusal for lack of permission, without blaming the owner-only rules', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "print_jobs"' };
    expect(explainProductionError(error, FALLBACK)).toBe(NO_PRIVILEGE_MESSAGE);
    expect(productionProblem({ code: '42501', message: 'permission denied for function start_print_job' })).toBe(
      NO_PRIVILEGE_MESSAGE,
    );
  });

  it('lets what the database wrote for a person through, as it is', () => {
    const message = 'La aplicación se actualizó mientras la tenías abierta: recarga la página y vuelve a cerrar la impresión. No se movió nada.';
    expect(explainProductionError({ code: 'P0001', message }, FALLBACK)).toBe(message);
  });

  it('leaves anything else to the general translation', () => {
    expect(productionProblem(new Error('boom'))).toBeNull();
    expect(productionProblem(null)).toBeNull();
    expect(explainProductionError({ code: '57014', message: 'canceling statement' }, FALLBACK)).toBe(FALLBACK);
  });
});
