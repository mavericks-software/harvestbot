import crypto from 'crypto';
import log from '../log';

export default (config, now = () => Date.now() / 1000) => {
  const logger = log(config);
  const REQUEST_MAX_AGE_SECS = 5 * 60;

  // The clock has to be read per request. Reading it from config meant it was
  // stamped once when the function instance started and cached for the life of
  // that instance, so every request that arrived later looked like it came from
  // the past and the window never closed. Math.abs also rejects future stamps.
  const timestampWithinRange = (timestamp) => {
    const sentAt = parseInt(timestamp, 10);
    return Number.isFinite(sentAt) && Math.abs(now() - sentAt) < REQUEST_MAX_AGE_SECS;
  };

  const signatureOk = (rawBody, timestamp, signature) => {
    const expected = `v0=${crypto
      .createHmac('sha256', config.slackSigningSecret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest('hex')}`;
    // Never log rawBody, the digest or the signature. The body carries the
    // caller's response_url, and logging the digest for a body we are about to
    // reject turns this endpoint into an oracle that hands an attacker a valid
    // signature for any request they care to forge.
    const expectedBytes = Buffer.from(expected);
    const receivedBytes = Buffer.from(signature || '');
    return expectedBytes.length === receivedBytes.length
      && crypto.timingSafeEqual(expectedBytes, receivedBytes);
  };

  const verifySlackRequest = (
    req,
    timestamp = req.header('X-Slack-Request-Timestamp'),
    signature = req.header('X-Slack-Signature'),
  ) => {
    if (!timestampWithinRange(timestamp)) {
      logger.warn(`Slack request timestamp outside the ${REQUEST_MAX_AGE_SECS}s window`);
      return false;
    }
    if (!signatureOk(req.rawBody, timestamp, signature)) {
      logger.warn('Slack request signature did not match');
      return false;
    }
    return true;
  };

  return {
    verifySlackRequest,
  };
};
