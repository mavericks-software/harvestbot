import crypto from 'crypto';
import { initFlextime } from './index';

// Deliberately does NOT mock ./verifier. index.test.js covers the access gate
// with verification stubbed out; this file covers the seam between the two, so
// a change to signature checking that would reject every real Slack request
// fails here rather than in production.

const mockSigningSecret = 'c0ffee0123456789abcdef0123456789';

jest.mock('./settings', () => () => ({
  getConfig: () => Promise.resolve({
    admins: ['U_ADMIN'],
    reportOnlyUsers: ['U_REPORTER'],
    slackSigningSecret: mockSigningSecret,
  }),
}));
jest.mock('./log', () => () => ({ info: () => {}, warn: () => {}, error: () => {} }));

const mockEnqueue = {
  stats: jest.fn(),
  reports: jest.fn(),
  flex: jest.fn(),
};

jest.mock('./cloud/queue', () => () => ({
  enqueueStatsRequest: (...args) => mockEnqueue.stats(...args),
  enqueueBillingReportsRequest: (...args) => mockEnqueue.reports(...args),
  enqueueWorkingHoursRequest: () => {},
  enqueueFlexTimeRequest: (...args) => mockEnqueue.flex(...args),
}));

describe('initFlextime with real signature verification', () => {
  // Shaped like a genuine Slack slash command post: rawBody arrives as a Buffer
  // on Cloud Functions, and header lookup is case-insensitive under Express and
  // returns undefined for anything that was not sent.
  const slackRequest = (userId, text, { timestamp, secret = mockSigningSecret } = {}) => {
    const sentAt = timestamp || Math.floor(Date.now() / 1000);
    const rawBody = `token=abc&team_id=T1&user_id=${userId}&command=%2Fflextime`
      + `&text=${encodeURIComponent(text)}&response_url=https%3A%2F%2Fhooks.slack.com%2Fx`;
    const headers = {
      'x-slack-request-timestamp': String(sentAt),
      'x-slack-signature': `v0=${crypto.createHmac('sha256', secret)
        .update(`v0:${sentAt}:${rawBody}`)
        .digest('hex')}`,
    };
    return {
      rawBody: Buffer.from(rawBody),
      body: { user_id: userId, text, response_url: 'https://hooks.slack.com/x' },
      header: (name) => headers[String(name).toLowerCase()],
    };
  };

  const call = async (req) => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.send = (body) => { res.body = body; return res; };
    res.json = (body) => { res.body = body; return res; };
    await initFlextime(req, res);
    return res;
  };

  beforeEach(() => {
    Object.values(mockEnqueue).forEach((fn) => fn.mockClear());
  });

  it('accepts a genuinely signed admin request and enqueues the work', async () => {
    await call(slackRequest('U_ADMIN', 'stats 2026 1'));
    expect(mockEnqueue.stats).toHaveBeenCalledTimes(1);
  });

  it('accepts a genuinely signed report-only request', async () => {
    await call(slackRequest('U_REPORTER', 'report 2026 1 virtanen'));
    expect(mockEnqueue.reports).toHaveBeenCalledTimes(1);
  });

  it('still applies the access gate to a genuinely signed request', async () => {
    const res = await call(slackRequest('U_REPORTER', 'stats 2026 1'));
    expect(mockEnqueue.stats).not.toHaveBeenCalled();
    expect(res.body.text).toMatch(/not authorized/);
  });

  it('rejects a request signed with the wrong secret', async () => {
    const res = await call(slackRequest('U_ADMIN', 'stats 2026 1', { secret: 'wrong-secret' }));
    expect(mockEnqueue.stats).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a correctly signed but stale request', async () => {
    const stale = Math.floor(Date.now() / 1000) - 400;
    const res = await call(slackRequest('U_ADMIN', 'stats 2026 1', { timestamp: stale }));
    expect(mockEnqueue.stats).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
