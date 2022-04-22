import log from '../log';
import {
  DEFAULT_HOURS_STATS_COLUMN_HEADERS,
  DEFAULT_BILLABLE_STATS_COLUMN_HEADERS,
  DEFAULT_WORKING_HOURS_REPORT_COLUMN_HEADERS,
} from './defaults';
import decrypter from '../cloud/key-ring';

export default () => {
  const inGoogleCloud = process.env.FUNCTION_NAME;
  const logger = log({ inGoogleCloud });
  const getEnvParam = (param) => (process.env[param]
    ? process.env[param]
    : logger.error(`Environment variable ${param} missing.`));
  const baseConfig = {
    inGoogleCloud,
    projectId: getEnvParam('GCLOUD_PROJECT'),
    region: getEnvParam('FUNCTION_REGION'),
  };
  const { decryptSecret } = decrypter(baseConfig);

  const getConfig = async () => {
    const secretConfigString = await decryptSecret();
    const secretConfig = JSON.parse(secretConfigString);
    return {
      ...baseConfig,
      ...secretConfig,
      emailDomains: secretConfig.emailDomains
        ? secretConfig.emailDomains.split(',')
        : [],
      hoursStatsColumnHeaders: secretConfig.hoursStatsColumnHeaders
        ? secretConfig.hoursStatsColumnHeaders.split(',')
        : DEFAULT_HOURS_STATS_COLUMN_HEADERS,
      billableStatsColumnHeaders: secretConfig.billableStatsColumnHeaders
        ? secretConfig.billableStatsColumnHeaders.split(',')
        : DEFAULT_BILLABLE_STATS_COLUMN_HEADERS,
      workingHoursReportHeaders: secretConfig.workingHoursReportHeaders
        ? secretConfig.workingHoursReportHeaders.split(',')
        : DEFAULT_WORKING_HOURS_REPORT_COLUMN_HEADERS,
      taskIds: {
        publicHoliday: parseInt(secretConfig.taskIds.publicHoliday, 10),
        vacation: parseInt(secretConfig.taskIds.vacation, 10),
        unpaidLeave: parseInt(secretConfig.taskIds.unpaidLeave, 10),
        sickLeave: parseInt(secretConfig.taskIds.sickLeave, 10),
        sickLeaveChildsSickness: parseInt(secretConfig.taskIds.sickLeaveChildsSickness, 10),
        flexLeave: parseInt(secretConfig.taskIds.flexLeave, 10),
        extraPaidLeave: parseInt(secretConfig.taskIds.extraPaidLeave, 10),
        productServiceDevelopment: parseInt(secretConfig.taskIds.productServiceDevelopment, 10),
        internallyInvoicable: parseInt(secretConfig.taskIds.internallyInvoicable, 10),
      },
      currentTime: new Date().getTime() / 1000,
    };
  };

  return {
    getConfig,
  };
};
