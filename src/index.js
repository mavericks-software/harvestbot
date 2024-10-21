import application from './app';
import log from './log';
import db from './cloud/db';
import queue from './cloud/queue';
import http from './http';
import settings from './settings';
import slackApi from './slack';
import verifier from './verifier';

let logger = null;
let appConfig = null;

const getAppConfig = async () => {
  if (appConfig) {
    return appConfig;
  }
  appConfig = await settings().getConfig();
  logger = log(appConfig);
  return appConfig;
};

const validateHarvestAccount = (config, account) => {
  const harvestAccount = account && account.trim().length > 0 ? account : 'mavericks';
  return config.harvestAccessTokens && config.harvestAccessTokens[account] && config.harvestAccessTokens && config.harvestAccessTokens[account] ? harvestAccount : 'mavericks';
};

export const initFlextime = async (req, res) => {
  const config = await getAppConfig();

  if (verifier(config).verifySlackRequest(req)) {
    const cmd = req.body.text;

    if (cmd === 'help') {
      return res.json({
        text: `
Bot for calculating your hourly balance. Use /flextime to start calculation. Usage: \n
/flextime stats <year> <month> [account] \n
  - send monthly reports for the listed users. \n
  - supports agileday as an account \n
/flextime report <year> <month> [account] \n
  - send monthly reports for the listed users. \n
  - supports agileday as an account \n
/flextime hours <email> <year> <month> <range> [account] \n
  - send working hours report. \n
  - supports agileday as an account (soon) \n
/flextime [account] \n
  - calculate flex saldo \n`,
      });
    }

    logger.info(`Received valid Slack request with cmd ${cmd}`);

    const cmdParts = cmd.split(' ');
    if (cmdParts.length > 0 && cmdParts[0].trim().length > 0) {
      const { admins } = config;

      if (!admins.includes(req.body.user_id)) {
        logger.warn(`Received unauthorized stats request from user ${req.body.user_id}`);
        return res.status(401).send('Unauthorized');
      }

      const currentDate = new Date();
      const year = cmdParts.length > 1 ? cmdParts[1] : currentDate.getFullYear();
      const month = cmdParts.length > 2 ? cmdParts[2] : currentDate.getMonth() + 1;

      const harvestAccount = validateHarvestAccount(config, cmdParts[cmdParts.length - 1]);
      // TODO: clean up implementation when switch to Agileday is done.
      const isAgileday = cmdParts[cmdParts.length - 1] === 'agileday';
      switch (cmdParts[0]) {
        case 'stats':
          logger.info('Enqueuing stats request');
          await queue(config)
            .enqueueStatsRequest({
              userId: req.body.user_id,
              responseUrl: req.body.response_url,
              year,
              month,
              harvestAccount,
              isAgileday,
            });
          return res.json({ text: 'Starting to generate stats. This may take a while.' });

        case 'report':
          logger.info('Enqueuing Harvest billing reports request');
          await queue(config)
            .enqueueBillingReportsRequest({
              userId: req.body.user_id,
              responseUrl: req.body.response_url,
              year,
              month,
              lastNames: cmdParts.slice(3).map((lastName) => lastName.toLowerCase()),
              harvestAccount,
              isAgileday,
            });
          return res.json({ text: 'Starting to generate billing reports. This may take a while.' });

        case 'hours':
          logger.info('Enqueuing working hours report request');
          await queue(config)
            .enqueueWorkingHoursRequest({
              userId: req.body.user_id,
              responseUrl: req.body.response_url,
              year,
              month,
              range: cmdParts.length > 3 ? cmdParts[3] : 6,
              harvestAccount,
              isAgileday,
            });
          return res.json({ text: 'Starting to generate working hours report. This may take a while.' });
        default:
          logger.warn('Received unknown command');
          return res.status(401).send('Unknown command');
      }
    }

    logger.info('Enqueuing flex time request');
    await queue(config)
      .enqueueFlexTimeRequest({
        userId: req.body.user_id,
        responseUrl: req.body.response_url,
        isAgileday: false,
      });
    return res.json({ text: 'Starting to calculate flextime. This may take a while... Join channel #harvest for weekly notifications.' });
  }

  logger.warn('Received invalid Slack request');
  return res.status(401).send('Unauthorized');
};

export const calcFlextime = async (message) => {
  const config = await getAppConfig();
  const request = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const slack = slackApi(config, http, request.responseUrl);
  const { userId, harvestAccount } = request;

  if (userId) {
    logger.info(`Fetching data for user id ${userId}`);
    const email = request.email || await slack.getUserEmailForId(userId);
    if (!email) {
      return slack.postMessage(userId, 'Cannot find email for Slack user id');
    }
    if (!request.email) {
      await slack.postMessage(userId, `Fetching time entries for email ${email}`);
    }
    await db(config).storeUserData(userId, email);
    logger.info('User data stored');

    const data = await application(config, http, harvestAccount).generateFlextime(email);
    logger.info('Flextime calculated');

    return slack.postMessage(userId, data.header, data.messages);
  }
  return logger.error('Cannot find Slack user id');
};

export const notifyUsers = async (req, res) => {
  const config = await getAppConfig();
  if (verifier(config).verifySlackRequest(req)) {
    const store = db(config);
    const msgQueue = queue(config);

    const users = await store.fetchUsers;
    logger.info(`Found ${users.length} users`);

    await Promise.all(users.map(async ({ email, id }) => {
      logger.info(`Notify ${email}`);
      return msgQueue.enqueueFlexTimeRequest({ userId: id, email });
    }));
    return res.json({ text: 'ok' });
  }
  return res.status(401).send('Unauthorized');
};

export const calcStats = async (message) => {
  const config = await getAppConfig();
  const request = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const slack = slackApi(config, http, request.responseUrl);
  const {
    userId, year, month, harvestAccount, isAgileday,
  } = request;

  if (userId) {
    logger.info(`Calculating stats requested by user ${userId} to harvest account ${harvestAccount}`);
    const email = await slack.getUserEmailForId(userId); // TODO: need slack admin role?
    if (!email) {
      return slack.postMessage(userId, 'Cannot find email for Slack user id');
    }

    const result = isAgileday
      ? await application(config, http, slack, harvestAccount)
        .generateAgiledayStats(year, month, email)
      : await application(config, http, slack, harvestAccount)
        .generateHarvestStats(year, month, email);
    logger.info('Stats generated');

    return slack.postMessage(userId, result);
  }
  return logger.error('Cannot find Slack user id');
};

export const calcBillingReports = async (message) => {
  const config = await getAppConfig();
  const request = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const slack = slackApi(config, http, request.responseUrl);
  const {
    userId, year, month, lastNames, harvestAccount, isAgileday,
  } = request;

  if (userId) {
    logger.info(`Calculating billing reports requested by user ${userId} for harvest account ${harvestAccount}`);
    const email = await slack.getUserEmailForId(userId); // TODO: need slack admin role?
    if (!email) {
      return slack.postMessage(userId, 'Cannot find email for Slack user id');
    }

    // TODO: clean up implementation when switch to Agileday is done.
    const result = isAgileday
      ? await application(config, http, slack, harvestAccount)
        .generateAgiledayBillingReports(year, month, lastNames, email)
      : await application(config, http, slack, harvestAccount)
        .generateHarvestBillingReports(year, month, lastNames, email);

    logger.info('Billing reports generated');

    return slack.postMessage(userId, result);
  }
  return logger.error('Cannot find Slack user id');
};

export const calcWorkingHours = async (message) => {
  const config = await getAppConfig();
  const request = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const slack = slackApi(config, http, request.responseUrl);
  const {
    userId,
    year,
    month,
    range,
  } = request;

  if (userId) {
    logger.info(`Calculating working hours report requested by user ${userId}`);

    const email = await slack.getUserEmailForId(userId); // TODO: need slack admin role?
    if (!email) {
      return slack.postMessage(userId, 'Cannot find email for Slack user id');
    }

    const result = await application(config, http)
      .generateWorkingHoursReport(year, month, range, email);
    logger.info('Reports generated');

    return slack.postMessage(userId, result);
  }
  return logger.error('Cannot find Slack user id');
};

export const sendReminders = async (req, res) => {
  const config = await getAppConfig();
  const slack = slackApi(config, http);
  await application(config, http, slack).sendMonthlyReminders();
  return res.json({ text: 'Monthly reminders triggered succesfully' });
};

// Invoke through pub/sub message
export const sendMissingHoursReport = async (message) => {
  const config = await getAppConfig();
  if (!config.missingWorkhoursReportEmail || config.missingWorkhoursReportEmail.length === 0) {
    logger.warn(`config.missingWorkhoursReportEmail is missing, cannot generate report, exiting. config.missingWorkhoursReportEmail: ${config.missingWorkhoursReportEmail}`);
    return;
  }
  const request = JSON.parse(Buffer.from(message.data, 'base64').toString());
  const { harvestAccount } = request;
  await application(config, http, harvestAccount)
    .generateMissingWorkHoursReport(config.missingWorkhoursReportEmail);
  logger.info('Missing hours report generated and sent');
};
