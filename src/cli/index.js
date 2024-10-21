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

  const generateStats = async (email, year, month, account) => {
    logger.info(`Generating stats for ${year}-${month}`);
    const harvestAccount = account && account.match(/^(witted|mavericks)$/g) ? account : 'mavericks';
    // TODO: clean up implementation when switch to Agileday is done.
    if (account === 'agileday') {
      logger.info(`Sending agileday stats report to ${email}`);
      const retval = await application(config, http, slack, harvestAccount)
        .generateAgiledayStats(year, month, email);
      logger.info(retval);
    } else {
      logger.info(`Sending stats report to ${email} for harvest account ${harvestAccount}`);
      const retval = await application(config, http, slack, harvestAccount)
        .generateHarvestStats(year, month, email);
      logger.info(retval);
    }
  };

  const generateBillingReports = async (email, year, month, lastNamesAndAccount) => {
    const account = lastNamesAndAccount[lastNamesAndAccount.length - 1];
    const harvestAccount = account && account.match(/^(witted|mavericks)$/g) ? account : 'mavericks';
    // TODO: clean up implementation when switch to Agileday is done.
    if (account === 'agileday') {
      logger.info(`Generating Agileday billing reports for ${year}-${month}`);
      const retval = await application(config, http, slack, harvestAccount)
        .generateAgiledayBillingReports(year, month, lastNamesAndAccount, email);
      logger.info(retval);
    } else {
      logger.info(`Generating billing reports for ${year}-${month} for harvest account ${harvestAccount}`);
      const retval = await application(config, http, slack, harvestAccount)
        .generateHarvestBillingReports(year, month, lastNamesAndAccount, email);
      logger.info(retval);
    }
  };

  const generateWorkingHoursReport = async (email, year, month, range, account) => {
    const harvestAccount = account && account.match(/^(witted|mavericks)$/g) ? account : 'mavericks';
    logger.info(`Generating working hours report, range ${range} months from ${year}-${month}`);
    await application(config, http, slack, harvestAccount)
      .generateWorkingHoursReport(year, month, range, email);
    logger.info(`Sent working hours report to ${email}`);
  };

  const sendMonthlyReminders = async (email, year, month) => {
    logger.info(`Sending monthly reminder for ${year}-${month} to ${email}`);
    await application(config, http, slack).sendMonthlyReminders(year, month, email, false);
  };

  const generateFlexTime = async (email, account) => {
    const harvestAccount = account && account.match(/^(witted|mavericks)$/g) ? account : 'mavericks';
    logger.info(`Calculating flextime for ${email} for Harvest account ${harvestAccount}`);
    const data = await application(config, http, slack, harvestAccount).generateFlextime(email);
    printResponse(data.header, data.messages);
  };

  const encryptConfiguration = async () => {
    logger.info('Encrypting configuration...');
    encryptSecret(JSON.stringify(configuration));
  };

  const decryptConfiguration = async () => {
    const conf = JSON.parse(await decryptSecret());
    /* eslint-disable no-console */
    console.log(`export HARVEST_ACCESS_TOKEN=${conf.harvestAccessToken}`);
    console.log(`export HARVEST_ACCESS_TOKENS=${conf.harvestAccessTokens}`);
    console.log(`export AGILEDAY_ACCESS_TOKEN=${conf.agiledayAccessToken}`);
    console.log(`export SLACK_BOT_TOKEN=${conf.slackBotToken}`);
    console.log(`export SLACK_SIGNING_SECRET=${conf.slackSigningSecret}`);
    console.log(`export SENDGRID_API_KEY=${conf.sendGridApiKey}`);
    /* eslint-enable no-console */
  };

  const generateMissingHoursReport = async (harvestAccount = 'mavericks') => {
    logger.info(`Generating missing workhours report for Harvest account ${harvestAccount}`);
    await application(config, http, slack, harvestAccount)
      .generateMissingWorkHoursReport(config.missingWorkhoursReportEmail);
    logger.info(`Sent missing workhours report for harvest account ${harvestAccount}`);
  };

  const start = () => {
    program
      .version(version, '-v, --version');
    program
      .command('stats <email> <year> <month> [harvestAccount]')
      .description('Send monthly statistics to given email address.')
      .action(generateStats);
    program
      .command('report <email> <year> <month> <lastNameAndAccount...>')
      .description('Send monthly reports to given email address for the listed users.')
      .action(generateBillingReports);
    program
      .command('hours <email> <year> <month> <range> [account]')
      .description('Send working hours report to given email address.')
      .action(generateWorkingHoursReport);
    program
      .command('flextime <email> [harvestAccount]')
      .description('Calculate flex saldo for given user.')
      .action(generateFlexTime);
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
    program
      .command('report-missing-hours [harvestAccount]')
      .description('Send report from missing hours in previous month')
      .action(generateMissingHoursReport);
    program.parse(process.argv);
  };

  return {
    start,
  };
};
