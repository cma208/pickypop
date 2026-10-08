import {
  cancelBlocker,
  canStopOrder,
  lineKind,
  nextStep,
  resumeTargets,
  STATUS_FLOW,
  statusFilterFromLink,
} from './pedidos.labels';

describe('statusFilterFromLink', () => {
  it('opens on the orders in progress unless a link asks for another filter', () => {
    expect(statusFilterFromLink(null)).toBe('open');
    expect(statusFilterFromLink('en-curso')).toBe('open');
  });

  // A quick sale is born delivered: the screen that sends people to look for it asks for all of them.
  it('reads «todos» and a status by its name', () => {
    expect(statusFilterFromLink('todos')).toBe('all');
    expect(statusFilterFromLink('delivered')).toBe('delivered');
    expect(statusFilterFromLink('on_hold')).toBe('on_hold');
  });

  it('ignores what it does not know, inherited names included', () => {
    expect(statusFilterFromLink('entregadisimo')).toBe('open');
    expect(statusFilterFromLink('toString')).toBe('open');
    expect(statusFilterFromLink('')).toBe('open');
  });
});

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

describe('canStopOrder', () => {
  it('offers pausing and cancelling while nothing has left the workshop', () => {
    expect(canStopOrder('confirmed', false)).toBe(true);
    expect(canStopOrder('ready', false)).toBe(true);
  });

  it('never once something was delivered: the shelf and the money already moved', () => {
    expect(canStopOrder('ready', true)).toBe(false);
    expect(canStopOrder('delivered', false)).toBe(false);
    expect(canStopOrder('closed', false)).toBe(false);
    expect(canStopOrder('cancelled', false)).toBe(false);
  });
});

describe('cancelBlocker', () => {
  it('sends the person to Caja while something collected is still in force', () => {
    expect(cancelBlocker(20)).toMatch(/S\/\s?20\.00 cobrados\. Para cancelarlo, primero anula esos cobros en Caja\./);
  });

  it('lets an order with nothing collected, or that is not a sale, be cancelled', () => {
    expect(cancelBlocker(0)).toBeNull();
    expect(cancelBlocker(null)).toBeNull();
  });
});

describe('lineKind', () => {
  it('reads a line with a variant as catalogue, whatever its quote said', () => {
    expect(lineKind('variant-1', null)).toBe('catalog');
  });

  it('reads one without a variant as made to order, unless its quote called it a service', () => {
    expect(lineKind(null, null)).toBe('custom');
    expect(lineKind(null, 'custom')).toBe('custom');
    expect(lineKind(null, 'service')).toBe('service');
  });
});
