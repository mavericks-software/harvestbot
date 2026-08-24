import { initFlextime } from './index';

jest.mock('./settings', () => () => ({
  getConfig: () => Promise.resolve({
    admins: ['U_ADMIN'],
    reportOnlyUsers: ['U_REPORTER'],
  }),
}));
jest.mock('./verifier', () => () => ({ verifySlackRequest: () => true }));
jest.mock('./log', () => () => ({ info: () => {}, warn: () => {}, error: () => {} }));

const mockEnqueue = {
  stats: jest.fn(),
  reports: jest.fn(),
  hours: jest.fn(),
  flex: jest.fn(),
};

jest.mock('./cloud/queue', () => () => ({
  enqueueStatsRequest: (...args) => mockEnqueue.stats(...args),
  enqueueBillingReportsRequest: (...args) => mockEnqueue.reports(...args),
  enqueueWorkingHoursRequest: (...args) => mockEnqueue.hours(...args),
  enqueueFlexTimeRequest: (...args) => mockEnqueue.flex(...args),
}));

describe('initFlextime access control', () => {
  const call = async (userId, text) => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.send = (body) => { res.body = body; return res; };
    res.json = (body) => { res.body = body; return res; };
    await initFlextime({ body: { user_id: userId, text, response_url: 'url' } }, res);
    return res;
  };

  const noWorkEnqueued = () => {
    expect(mockEnqueue.stats).not.toHaveBeenCalled();
    expect(mockEnqueue.reports).not.toHaveBeenCalled();
    expect(mockEnqueue.hours).not.toHaveBeenCalled();
    expect(mockEnqueue.flex).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    Object.values(mockEnqueue).forEach((fn) => fn.mockClear());
  });

  it('enqueues every command for an admin', async () => {
    await call('U_ADMIN', 'stats 2026 1');
    await call('U_ADMIN', 'report 2026 1 virtanen');
    await call('U_ADMIN', 'hours 2026 1 6');
    expect(mockEnqueue.stats).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.reports).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.hours).toHaveBeenCalledTimes(1);
  });

  it('enqueues report for a report-only user', async () => {
    await call('U_REPORTER', 'report 2026 1 virtanen');
    expect(mockEnqueue.reports).toHaveBeenCalledTimes(1);
  });

  it('denies stats and hours to a report-only user without enqueueing anything', async () => {
    const stats = await call('U_REPORTER', 'stats 2026 1');
    const hours = await call('U_REPORTER', 'hours 2026 1 6');
    noWorkEnqueued();
    expect(stats.body.text).toMatch(/not authorized/);
    expect(hours.body.text).toMatch(/not authorized/);
  });

  it('denies every command to a user in no list', async () => {
    await call('U_NOBODY', 'stats 2026 1');
    await call('U_NOBODY', 'report 2026 1 virtanen');
    await call('U_NOBODY', 'hours 2026 1 6');
    noWorkEnqueued();
  });

  it('does not enqueue anything for an unknown command', async () => {
    const res = await call('U_ADMIN', 'rm -rf');
    noWorkEnqueued();
    expect(res.body.text).toMatch(/Unknown command/);
  });

  it('still calculates flex saldo for any user with no subcommand', async () => {
    await call('U_NOBODY', '');
    expect(mockEnqueue.flex).toHaveBeenCalledTimes(1);
  });

  it('answers help without enqueueing anything', async () => {
    const res = await call('U_NOBODY', 'help');
    noWorkEnqueued();
    expect(res.body.text).toMatch(/flextime/);
  });
});
