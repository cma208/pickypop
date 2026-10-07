import { endByToDb, scheduleProblem, timeFromDb, windowExample, type ScheduleDraft } from './schedule.model';

const draft = (overrides: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  firstStart: '06:00',
  lastStart: '23:00',
  endBy: '00:00',
  changeoverMinutes: 15,
  holdDays: 1,
  holdTime: '23:00',
  ...overrides,
});

describe('printing window', () => {
  it('shows midnight as 00:00 and stores it as 24:00', () => {
    expect(timeFromDb('24:00:00', '24:00')).toBe('00:00');
    expect(timeFromDb('06:00:00', '06:00')).toBe('06:00');
    expect(timeFromDb(null, '23:00')).toBe('23:00');
    expect(endByToDb('00:00')).toBe('24:00');
    expect(endByToDb('22:30')).toBe('22:30');
  });

  it("accepts the owner's window: 6:00 to 23:00, done by midnight", () => {
    expect(scheduleProblem(draft())).toBeNull();
  });

  it('refuses a window that ends before it starts', () => {
    expect(scheduleProblem(draft({ lastStart: '05:00' }))).toContain('después de la primera');
    expect(scheduleProblem(draft({ endBy: '22:00' }))).toContain('terminado');
    expect(scheduleProblem(draft({ changeoverMinutes: -1 }))).toContain('minutos');
  });

  it('says the window with an example a person can check', () => {
    expect(windowExample(draft())).toBe('Por ejemplo, una placa de 3 h puede empezar hasta las 21:00.');
    expect(windowExample(draft({ lastStart: '20:00' }))).toContain('20:00');
    expect(windowExample(draft({ firstStart: '22:00', lastStart: '23:00' }), 3)).toContain('no cabe');
  });
});
