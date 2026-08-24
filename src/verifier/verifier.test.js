import verify from './index';

describe('Verifier', () => {
  const SENT_AT = 1531420618;
  const SECRET = '8f742231b10e8888abcd99yyyzzz85a5';
  const RAW_BODY = 'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c';
  const SIGNATURE = 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503';

  // No default parameters: these tests need to pass undefined through rather
  // than have it replaced by a valid value.
  const request = (timestamp, signature, rawBody = RAW_BODY) => ({
    rawBody,
    header: (param) => (param === 'X-Slack-Request-Timestamp' ? timestamp : signature),
  });

  // The clock is injected so the tests stay deterministic. Production reads it
  // per request rather than from config, which is the point of the fix.
  const verifies = (nowSecs, req) => verify({ slackSigningSecret: SECRET }, () => nowSecs)
    .verifySlackRequest(req);

  const inWindow = SENT_AT + 60;

  it('accepts a correctly signed request inside the window', () => {
    expect(verifies(inWindow, request(SENT_AT, SIGNATURE))).toBe(true);
  });

  it('rejects a request older than the window', () => {
    expect(verifies(SENT_AT + 301, request(SENT_AT, SIGNATURE))).toBe(false);
  });

  it('rejects a request timestamped in the future', () => {
    expect(verifies(SENT_AT - 301, request(SENT_AT, SIGNATURE))).toBe(false);
  });

  it('rejects a missing or unparseable timestamp', () => {
    expect(verifies(inWindow, request(undefined, SIGNATURE))).toBe(false);
    expect(verifies(inWindow, request('nope', SIGNATURE))).toBe(false);
  });

  it('rejects a missing or wrong signature', () => {
    expect(verifies(inWindow, request(SENT_AT, undefined))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, ''))).toBe(false);
    expect(verifies(inWindow, request(SENT_AT, 'v0=deadbeef'))).toBe(false);
  });

  it('rejects a signature of the right length but wrong bytes', () => {
    expect(verifies(inWindow, request(SENT_AT, `v0=${'0'.repeat(64)}`))).toBe(false);
  });

  it('rejects a body that does not match the signature', () => {
    expect(verifies(inWindow, request(SENT_AT, SIGNATURE, `${RAW_BODY}&text=stats`))).toBe(false);
  });
});
