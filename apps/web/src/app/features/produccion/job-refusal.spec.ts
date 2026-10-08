import { refusalAfterReload, type JobRefusal } from './print-job-card';

const REFUSED: JobRefusal = { jobId: 'job-1', status: 'planned', message: 'Este trabajo ya no está planificado.' };

describe('refusalAfterReload', () => {
  it('leaves the refusal to the card while the job is still where it was', () => {
    expect(refusalAfterReload(REFUSED, [{ id: 'job-1', status: 'planned' }])).toBeNull();
  });

  it('says it on the page once the job moved, so it does not vanish with its card', () => {
    expect(refusalAfterReload(REFUSED, [{ id: 'job-1', status: 'printing' }])).toBe(REFUSED.message);
    expect(refusalAfterReload(REFUSED, [])).toBe(REFUSED.message);
  });

  it('says nothing when nothing was refused', () => {
    expect(refusalAfterReload(null, [])).toBeNull();
  });
});
