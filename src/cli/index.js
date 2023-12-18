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

  const { encryptSecret, decryptSecret } = encrypter(config);

  const printResponse = (header, msgs) => {
    logger.info(header);
    if (msgs) {
      msgs.forEach((msg) => logger.info(msg));
    }
  };

  const generateStats = async (email, year, month) => {
    logger.info(`Generating stats for ${year}-${month}`);
    await application(config, http, slack).generateStats(year, month, email);
    logger.info(`Sent stats report to ${email}`);
  };

  const generateBillingReports = async (email, year, month, lastNames, opts) => {
    logger.info(`Generating billing reports for ${year}-${month}`);

    const { harvest } = opts;
    const harvestAccount = harvest && harvest.match(/^(witted|mavericks)$/g) ? harvest : 'mavericks';
    await application(config, http, slack, harvestAccount)
      .generateBillingReports(year, month, lastNames, email);
    logger.info(`Sent billing reports to ${email}`);
  };

  const generateWorkingHoursReport = async (email, year, month, range) => {
    logger.info(`Generating working hours report, range ${range} months from ${year}-${month}`);
    await application(config, http, slack).generateWorkingHoursReport(year, month, range, email);
    logger.info(`Sent working hours report to ${email}`);
  };

  const sendMonthlyReminders = async (email, year, month) => {
    logger.info(`Sending monthly reminder for ${year}-${month} to ${email}`);
    await application(config, http, slack).sendMonthlyReminders(year, month, email, false);
  };

  const calcFlexTime = async (email, harvestAccount = 'mavericks') => {
    logger.info(`Calculating flextime for ${email}`);
    const data = await application(config, http, slack, harvestAccount).calcFlextime(email);
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
    console.log(`export HARVEST_ACCESS_TOKENS=${conf.harvestAccessTokens}`);
    console.log(`export HARVEST_ACCOUNT_IDS=${conf.harvestAccountIds}`);
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
    console.log(`export TASK_ID_PARENTAL_LEAVE=${conf.taskIds.parentalLeave}`);
    console.log(`export TASK_ID_FLEX_LEAVE=${conf.taskIds.flexLeave}`);
    console.log(`export TASK_ID_EXTRA_PAID_LEAVE=${conf.taskIds.extraPaidLeave}`);
    console.log(`export TASK_ID_PRODUCT_SERVICE_DEVELOPMENT=${conf.taskIds.productServiceDevelopment}`);
    console.log(`export TASK_ID_INTERNALLY_INVOICABLE=${conf.taskIds.internallyInvoicable}`);
    console.log(`export ADMINS=${conf.admins}`);
    /* eslint-enable no-console */
  };

  const start = () => {
    program
      .version(version, '-v, --version');
    program
      .command('stats <email> <year> <month> [harvestAccount]')
      .description('Send monthly statistics to given email address.')
      .action(generateStats);
    program
      .command('report <email> <year> <month> <lastname...>')
      .option('-a, --harvest <harvestAccount>', 'Harvest account')
      .description('Send monthly reports to given email address for the listed users.')
      .action(generateBillingReports);
    program
      .command('hours <email> <year> <month> <range> [harvestAccount]')
      .description('Send working hours report to given email address.')
      .action(generateWorkingHoursReport);
    program
      .command('flextime <email> [harvestAccount]')
      .description('Calculate flex saldo for given user.')
      .action(calcFlexTime);
    program
      .command('remind <email> <year> <month> [harvestAccount]')
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
