import { nextStep, resumeTargets, STATUS_FLOW } from './pedidos.labels';

describe('nextStep', () => {
  it('offers delivering instead of "Entregado" while something is still pending', () => {
    expect(nextStep('ready', true)).toEqual({ kind: 'deliver' });
  });

  it('keeps the plain status steps that the database accepts by hand', () => {
    expect(nextStep('confirmed', true)).toEqual({ kind: 'status', status: 'queued' });
    expect(nextStep('post_processing', true)).toEqual({ kind: 'status', status: 'ready' });
    // Once delivered nothing is pending, so closing is a plain step.
    expect(nextStep('delivered', false)).toEqual({ kind: 'status', status: 'closed' });
  });

  it('lets an order with nothing pending reach "Entregado" by hand, as the database does', () => {
    expect(nextStep('ready', false)).toEqual({ kind: 'status', status: 'delivered' });
  });

  it('offers nothing at the end of the path or off it', () => {
    expect(nextStep('closed', false)).toBeNull();
    expect(nextStep('on_hold', true)).toBeNull();
    expect(nextStep('cancelled', false)).toBeNull();
  });
});

describe('resumeTargets', () => {
  it('never offers to resume an order with something pending as delivered or closed', () => {
    expect(resumeTargets(true)).toEqual(['confirmed', 'queued', 'printing', 'post_processing', 'ready']);
  });

  it('offers the whole path when nothing is pending', () => {
    expect(resumeTargets(false)).toEqual(STATUS_FLOW);
  });
});
