/* eslint-disable import/no-extraneous-dependencies */
import program from 'commander';
import configuration from 'config';
/* eslint-enable import/no-extraneous-dependencies */

import application from '../app';
import slackApi from '../slack';
import log from '../log';
import encrypter from '../cloud/key-ring';
import { version } from '../../package.json';

export default (config, http) => {
  const logger = log(config);
  const slack = slackApi(config, http);
  const app = application(config, http, slack);
  const { encryptSecret, decryptSecret } = encrypter(config);

  const printResponse = (header, msgs) => {
    logger.info(header);
    if (msgs) {
      msgs.forEach((msg) => logger.info(msg));
    }
  };

  const generateStats = async (email, year, month) => {
    logger.info(`Generating stats for ${year}-${month}`);
    await app.generateStats(year, month, email);
    logger.info(`Sent stats report to ${email}`);
  };

  const generateReports = async (email, year, month, lastNames) => {
    logger.info(`Generating reports for ${year}-${month}`);
    await app.generateReports(year, month, lastNames, email);
    logger.info(`Sent report to ${email}`);
  };

  const sendMonthlyReminders = async (email, year, month) => {
    logger.info(`Sending monthly reminder for ${year}-${month} to ${email}`);
    await app.sendMonthlyReminders(year, month, email, false);
  };

  const calcFlexTime = async (email) => {
    logger.info(`Calculating flextime for ${email}`);
    const data = await app.calcFlextime(email);
    printResponse(data.header, data.messages);
  };

  const encryptConfiguration = async () => {
    logger.info('Encrypting configuration...');
    encryptSecret(JSON.stringify(configuration));
  };

  const decryptConfiguration = async () => {
    const conf = JSON.parse(await decryptSecret());
    /* eslint-disable no-console */
    console.log(`export ALLOWED_EMAIL_DOMAINS=${conf.emailDomains}`);
    console.log(`export HARVEST_ACCESS_TOKEN=${conf.harvestAccessToken}`);
    console.log(`export HARVEST_ACCOUNT_ID=${conf.harvestAccountId}`);
    console.log(`export SLACK_BOT_TOKEN=${conf.slackBotToken}`);
    console.log(`export SLACK_SIGNING_SECRET=${conf.slackSigningSecret}`);
    console.log(`export SLACK_NOTIFY_CHANNEL_ID=${conf.notifyChannelId}`);
    console.log(`export HOURS_STATS_COLUMN_HEADERS=${conf.hoursStatsColumnHeaders}`);
    console.log(`export SENDGRID_API_KEY=${conf.sendGridApiKey}`);
    console.log(`export TASK_ID_PUBLIC_HOLIDAY=${conf.taskIds.publicHoliday}`);
    console.log(`export TASK_ID_VACATION=${conf.taskIds.vacation}`);
    console.log(`export TASK_ID_UNPAID_LEAVE=${conf.taskIds.unpaidLeave}`);
    console.log(`export TASK_ID_SICK_LEAVE=${conf.taskIds.sickLeave}`);
    console.log(`export TASK_ID_SICK_LEAVE_CHILDS_SICKNESS=${conf.taskIds.sickLeaveChildsSickness}`);
    console.log(`export TASK_ID_FLEX_LEAVE=${conf.taskIds.flexLeave}`);
    console.log(`export TASK_ID_PRODUCT_SERVICE_DEVELOPMENT=${conf.taskIds.productServiceDevelopment}`);
    /* eslint-enable no-console */
  };

  const start = () => {
    program
      .version(version, '-v, --version');
    program
      .command('stats <email> <year> <month>')
      .description('Send monthly statistics to given email address.')
      .action(generateStats);
    program
      .command('report <email> <year> <month> <lastname...>')
      .description('Send monthly reports to given email address for the listed users.')
      .action(generateReports);
    program
      .command('flextime <email>')
      .description('Calculate flex saldo for given user.')
      .action(calcFlexTime);
    program
      .command('remind <email> <year> <month>')
      .description('Send monthly reminder for given user.')
      .action(sendMonthlyReminders);
    program
      .command('encrypt')
      .description('Encrypt and store app configuration.')
      .action(encryptConfiguration);
    program
      .command('decrypt')
      .description('Decrypt and show app configuration.')
      .action(decryptConfiguration);
    program.parse(process.argv);
  };

  return {
    start,
  };
};
