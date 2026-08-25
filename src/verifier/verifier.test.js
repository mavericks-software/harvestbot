import crypto from 'crypto';
import log from '../log';
import verify from './index';

jest.mock('../log', () => ({ __esModule: true, default: jest.fn() }));

describe('Verifier', () => {
  const SENT_AT = 1531420618;
  const SECRET = '8f742231b10e8888abcd99yyyzzz85a5';
  const RAW_BODY = 'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c';
  const SIGNATURE = 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503';

  const sign = (timestamp, body = RAW_BODY) => `v0=${crypto
    .createHmac('sha256', SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;

  // timestamp and signature deliberately have no defaults: these tests need to
  // pass undefined through rather than have it replaced by a valid value. Any
  // case that needs a missing rawBody builds the request inline for the same
  // reason.
  const request = (timestamp, signature, rawBody = RAW_BODY) => ({
    rawBody,
    header: (param) => (param === 'X-Slack-Request-Timestamp' ? timestamp : signature),
  });

  const inWindow = SENT_AT + 60;

  let logged = [];

  beforeEach(() => {
    logged = [];
    const record = (...args) => logged.push(...args);
    log.mockReturnValue({ info: record, warn: record, error: record });
  });

  // The clock is injected so the tests stay deterministic. Production reads it
  // per request rather than from config, which is the point of the fix.
  const verifier = (nowSecs) => verify({ slackSigningSecret: SECRET }, () => nowSecs);
  const verifies = (nowSecs, req) => verifier(nowSecs).verifySlackRequest(req);

  it('accepts a correctly signed request inside the window', () => {
    expect(verifies(inWindow, request(SENT_AT, SIGNATURE))).toBe(true);
  });

  it('rejects a request older than the window', () => {
    expect(verifies(SENT_AT + 301, request(SENT_AT, SIGNATURE))).toBe(false);
  });

  it('rejects a request timestamped in the future', () => {
    expect(verifies(SENT_AT - 301, request(SENT_AT, SIGNATURE))).toBe(false);
  });

  it('rejects a missing or malformed timestamp', () => {
    expect(verifies(inWindow, request(undefined, SIGNATURE))).toBe(false);
    expect(verifies(inWindow, request('nope', SIGNATURE))).toBe(false);
    expect(verifies(inWindow, request(` ${SENT_AT}`, SIGNATURE))).toBe(false);
    expect(verifies(inWindow, request(`${SENT_AT}junk`, SIGNATURE))).toBe(false);
    expect(verifies(inWindow, request(`${SENT_AT},${SENT_AT}`, SIGNATURE))).toBe(false);
  });

  it('rejects a missing, wrong or non-string signature', () => {
    expect(verifies(inWindow, request(SENT_AT, undefined))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, ''))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, 'v0=deadbeef'))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, 12345))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, [SIGNATURE]))).toBe(false);
  });

  it('rejects a signature of the right length but wrong bytes', () => {
    expect(verifies(inWindow, request(SENT_AT, `v0=${'0'.repeat(64)}`))).toBe(false);
  });

  it('rejects a multi-byte signature without throwing', () => {
    const multibyte = `v0=${'0'.repeat(63)}é`;
    expect(() => verifies(inWindow, request(SENT_AT, multibyte))).not.toThrow();
    expect(verifies(inWindow, request(SENT_AT, multibyte))).toBe(false);
  });

  it('rejects a body that does not match the signature', () => {
    expect(verifies(inWindow, request(SENT_AT, SIGNATURE, `${RAW_BODY}&text=stats`))).toBe(false);
  });

  it('accepts a Buffer body, the shape Cloud Functions supplies', () => {
    expect(verifies(inWindow, request(SENT_AT, SIGNATURE, Buffer.from(RAW_BODY)))).toBe(true);
  });

  it('rejects a missing body without throwing', () => {
    const noBody = {
      rawBody: undefined,
      header: (param) => (param === 'X-Slack-Request-Timestamp' ? SENT_AT : SIGNATURE),
    };
    expect(() => verifies(inWindow, noBody)).not.toThrow();
    expect(verifies(inWindow, noBody)).toBe(false);
  });

  // Regression guard for the bug this module was fixed for: the clock used to
  // be stamped once per instance, so the window never closed.
  it('reads the clock on every request, not once per instance', () => {
    let nowSecs = inWindow;
    const reused = verify({ slackSigningSecret: SECRET }, () => nowSecs);
    const req = request(SENT_AT, SIGNATURE);
    expect(reused.verifySlackRequest(req)).toBe(true);
    nowSecs = SENT_AT + 301;
    expect(reused.verifySlackRequest(req)).toBe(false);
    nowSecs = inWindow;
    expect(reused.verifySlackRequest(req)).toBe(true);
  });

  // Regression guard for the signing oracle: logging the digest for a request
  // we are about to reject hands the caller a valid signature for that body.
  it('never logs the digest, the signature or the body', () => {
    verifies(inWindow, request(SENT_AT, `v0=${'0'.repeat(64)}`));
    verifies(inWindow, request(SENT_AT, SIGNATURE));
    verifies(SENT_AT + 301, request(SENT_AT, SIGNATURE));
    const output = logged.join(' ');
    expect(output).not.toContain(sign(SENT_AT).slice(3));
    expect(output).not.toContain(SIGNATURE);
    expect(output).not.toContain('response_url');
    expect(output).not.toContain(RAW_BODY);
  });

  it('compares signatures in constant time', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    try {
      expect(verifies(inWindow, request(SENT_AT, `v0=${'0'.repeat(64)}`))).toBe(false);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('defaults to a real seconds-based clock when none is injected', () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const req = request(nowSecs, sign(nowSecs));
    expect(verify({ slackSigningSecret: SECRET }).verifySlackRequest(req)).toBe(true);
    const stale = Math.floor(Date.now() / 1000) - 400;
    expect(verify({ slackSigningSecret: SECRET })
      .verifySlackRequest(request(stale, sign(stale)))).toBe(false);
  });
});
