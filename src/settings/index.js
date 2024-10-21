import log from '../log';
import base from './baseConfig';
import decrypter from '../cloud/key-ring';

// Format string 'company1:bar,company2:foo' to {company1: 'bar', company2: 'foo'}
const keyPairFromStr = (str) => (str ? str
  .split(',')
  .map((pair) => pair.trim().split(':'))
  .reduce((acc, curr) => ({ ...acc, [curr[0]]: curr[1].trim() }), {}) : {});

export default () => {
  const inGoogleCloud = process.env.FUNCTION_NAME;
  const logger = log({ inGoogleCloud });
  const getEnvParam = (param) => (process.env[param]
    ? process.env[param]
    : logger.error(`Environment variable ${param} missing.`));
  const baseConfig = {
    ...base,
    inGoogleCloud,
    projectId: getEnvParam('GCLOUD_PROJECT'),
    region: getEnvParam('FUNCTION_REGION'),
  };
  const { decryptSecret } = decrypter(baseConfig);
  const getConfig = async () => {
    const secretConfigString = await decryptSecret();
    const secretConfig = JSON.parse(secretConfigString);

    return {
      // From KMS
      harvestAccessTokens: keyPairFromStr(secretConfig.harvestAccessTokens),
      agiledayAccessToken: secretConfig.agiledayAccessToken,
      slackBotToken: secretConfig.slackBotToken,
      slackSigningSecret: secretConfig.slackSigningSecret,
      sendGridApiKey: secretConfig.sendGridApiKey,
      // From Local
      ...baseConfig,
      harvestAccountIds: keyPairFromStr(baseConfig.harvestAccountIds),
      // Generated
      currentTime: new Date().getTime() / 1000,
    };
  };

  return {
    getConfig,
  };
};
