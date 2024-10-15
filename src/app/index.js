import { tmpdir } from 'os';
import { unlinkSync } from 'fs';

import log from '../log';

import analyze from './analyzer';
import excel from './excel';
import cal from './calendar';
import harvest, {
  harvestGenerateMonthlyHoursStats, harvestSortMonthlyUserEntriesByProjectAndTask,
  harvestSortRawTimeEntriesByUser,
} from './harvest';
import emailer from './emailer';
import writeBillingReport from './pdf';
import agileday, {
  agiledayGenerateMonthlyHoursStats,
  agiledaySortMonthlyUserEntriesByProjectAndTask,
  agiledaySortRawTimeEntriesByUser,
} from './agileday';

export default (config, http, slack, harvestAccount = 'mavericks') => {
  const logger = log(config);
  const formatDate = (date) => date.toLocaleDateString(
    'en-US',
    {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    },
  );
  const validateEmail = (email, emailParts = email.split('@')) => (config.emailDomains.includes(emailParts[1]) ? emailParts[0] : null);

  const calendar = cal();

  const harvestTracker = harvest(config, http, harvestAccount);
  const agiledayTracker = agileday(config, http);
  const round = (val) => Math.floor(val * 2) / 2;

  const countWeekdays = (startDate, endDate) => {
    const d = new Date(startDate);
    let count = 0;
    while (d <= endDate) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        count += 1;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  };

  const generateFlextime = async (email) => {
    const analyzer = analyze(config);
    const userName = validateEmail(email);
    if (!userName) {
      return { header: `Invalid email domain for ${email}` };
    }

    logger.info(`Fetch data for ${email}`);

    const entries = await harvestTracker.getTimeEntriesForEmail(userName, validateEmail);
    if (!entries) {
      return { header: `Unable to find time entries for ${email}` };
    }
    if (entries.length === 0) {
      return { header: `No time entries found for ${email}`, messages: [] };
    }
    const latestFullDay = calendar.getLatestFullWorkingDay();
    const range = analyzer.getPeriodRange(entries, latestFullDay);
    logger.info(`Received range starting from ${formatDate(range.start)} to ${formatDate(range.end)}`);

    const totalHours = calendar.getTotalWorkHoursSinceDate(range.start, range.end);
    logger.info(`Total working hours from range start ${totalHours}`);

    const result = analyzer.calculateWorkedHours(range.entries);
    if (result.warnings.length > 0) {
      logger.info(result.warnings);
    } else {
      logger.info('No warnings!');
    }

    const header = `*Your flex hours count: ${round(result.total - totalHours)}*`;
    const messages = [
      `Latest calendar working day: ${formatDate(range.end)}`,
      `Last time you have recorded hours: ${formatDate(new Date(range.entries[range.entries.length - 1].date))}`,
      ...result.warnings,
      `Current month ${result.billablePercentageCurrentMonth}% billable`,
    ];

    logger.info(header);
    logger.info('All done!');

    return { header, messages };
  };

  const generateHarvestStats = async (
    yearArg,
    monthArg,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    const analyzer = analyze(config);
    const validEmail = validateEmail(email);
    if (!validEmail) {
      return `Invalid email domain for ${email}`;
    }

    const users = await harvestTracker.getUsers();

    const rawTimeEntries = await harvestTracker.getMonthlyTimeEntries(year, month);
    const allEntries = harvestSortRawTimeEntriesByUser(rawTimeEntries, users);
    const entriesByType = allEntries.reduce((result, entry) => {
      if (entry.user.roles.includes('Non-billable') && !entry.user.is_contractor) {
        result.nonInvoicable.push(entry);
      } else if (entry.user.is_contractor) {
        result.contractors.push(entry);
      } else {
        result.invoicable.push(entry);
      }
      return result;
    },
    {
      invoicable: [],
      nonInvoicable: [],
      contractors: [],
    });

    const monthlyHoursRows = await harvestGenerateMonthlyHoursStats(
      calendar,
      analyzer,
      entriesByType.invoicable,
      entriesByType.nonInvoicable,
      entriesByType.contractors,
      year,
      month,
    );

    const taskRates = await harvestTracker.getTaskAssignments();
    const monthlyBillingRows = analyzer.getBillableStats(allEntries, taskRates);

    const fileName = `${year}-${month}-hours-${new Date().getTime()}.xlsx`;
    const filePath = `${tmpdir()}/${fileName}`;
    logger.info(`Writing stats to ${filePath}`);
    excel().writeWorkbook(
      filePath,
      [{
        rows: monthlyHoursRows,
        title: `${year}-${month}-hours`,
        headers: config.hoursStatsColumnHeaders,
        columns: [{ index: 0, width: 20 }, { index: 5, width: 20 }],
      },
      {
        rows: monthlyBillingRows,
        title: `${year}-${month}-billable`,
        headers: config.billableStatsColumnHeaders,
        columns: [{ index: 0, width: 20 }, { index: 1, width: 20 }, { index: 3, width: 20 }],
      }],
    );
    logger.info(`Sending stats to ${email}`);
    await emailer(config).sendEmail(email, 'Monthly harvest stats', `${year}-${month}`, [filePath]);
    unlinkSync(filePath);
    return `Stats sent to email ${email}.`;
  };

  const generateAgiledayStats = async (
    yearArg,
    monthArg,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    const analyzer = analyze(config, 'agileday');
    const validEmail = validateEmail(email);
    if (!validEmail) {
      return `Invalid email domain for ${email}`;
    }

    const users = (await agiledayTracker.getUsers());
    const rawTimeEntries = await agiledayTracker.getMonthlyTimeEntries(year, month);
    if (!rawTimeEntries || rawTimeEntries.length === 0) {
      return 'No time entries found';
    }

    const allEntries = agiledaySortRawTimeEntriesByUser(rawTimeEntries, users);

    const entriesByCompany = allEntries.reduce((result, entry) => {
      if (entry.user.segment !== 'EMPLOYEE') return result;
      if (!result[entry.companyName]) {
        // eslint-disable-next-line no-param-reassign
        result[entry.companyName] = [];
      }
      result[entry.companyName].push(entry);
      return result;
    },
    {});

    const monthlyHoursRows = await agiledayGenerateMonthlyHoursStats(
      calendar,
      analyzer,
      entriesByCompany,
      year,
      month,
    );

    // NOTE: agileday implementation uses entry data for hourly task rate,
    // instead of separate task rates.
    const monthlyBillingRows = analyzer.getBillableStats(allEntries, {});

    const fileName = `${year}-${month}-hours-${new Date().getTime()}.xlsx`;
    const filePath = `${tmpdir()}/${fileName}`;
    logger.info(`Writing stats to ${filePath}`);
    excel().writeWorkbook(
      filePath,
      [{
        rows: monthlyHoursRows,
        title: `${year}-${month}-hours`,
        headers: config.hoursStatsColumnHeaders,
        columns: [{ index: 0, width: 20 }, { index: 5, width: 20 }],
      },
      {
        rows: monthlyBillingRows,
        title: `${year}-${month}-billable`,
        headers: config.billableStatsColumnHeaders,
        columns: [{ index: 0, width: 20 }, { index: 1, width: 20 }, { index: 3, width: 20 }],
      }],
    );
    logger.info(`Sending stats to ${email}`);
    await emailer(config).sendEmail(email, 'Monthly agileday stats', `${year}-${month}`, [filePath]);
    unlinkSync(filePath);
    return `Stats sent to email ${email}.`;
  };

  const generateHarvestBillingReports = async (
    yearArg,
    monthArg,
    lastNames,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    // use Slack email
    const validEmail = validateEmail(email);
    if (!validEmail) {
      return `Invalid email domain for ${email}`;
    }

    const users = await harvestTracker.getUsers();
    const selectedUsers = users.filter((user) => lastNames.includes(user.last_name.toLowerCase()));
    const rawTimeEntries = await harvestTracker.getMonthlyTimeEntries(year, month);
    const entries = harvestSortRawTimeEntriesByUser(rawTimeEntries, selectedUsers, false)
      .map((monthlyEntries) => ({
        user: {
          firstName: monthlyEntries.user.first_name,
          lastName: monthlyEntries.user.last_name,
        },
        entries: harvestSortMonthlyUserEntriesByProjectAndTask(monthlyEntries.entries),
      }));

    const reportPaths = [];
    entries.forEach((userEntries) => {
      Object.keys(userEntries.entries).forEach((projectId) => {
        const projectEntries = userEntries.entries[projectId];
        const escapedProjectName = projectEntries.projectName.replace(/(\W+)/gi, '_');
        const fileName = `${userEntries.user.lastName}_${escapedProjectName}_${year}_${month}.pdf`;
        const filePath = `${tmpdir()}/${fileName}`;
        logger.info(`Writing billing report to ${filePath}`);
        writeBillingReport(filePath, userEntries.user, projectEntries);
        reportPaths.push(filePath);
      });
    });
    logger.info(`Sending billing report to ${email}`);
    await emailer(config).sendEmail(email, 'Monthly harvest billing reports', `${year}-${month}`, reportPaths);
    reportPaths.forEach((path) => unlinkSync(path));
    return `Billing reports (harvest) sent to email ${email}.`;
  };

  const generateAgiledayBillingReports = async (
    yearArg,
    monthArg,
    lastNames,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    // use Slack email
    const validEmail = validateEmail(email);
    if (!validEmail) {
      return `Invalid email domain for ${email}`;
    }
    const users = await agiledayTracker.getUsers();

    const selectedUsers = users.filter((user) => lastNames.includes(user.lastName.toLowerCase()));

    const rawTimeEntries = await agiledayTracker.getMonthlyTimeEntries(year, month);
    if (!rawTimeEntries || rawTimeEntries.length === 0) {
      return 'No time entries found';
    }

    const entries = (agiledaySortRawTimeEntriesByUser(rawTimeEntries, selectedUsers, false))
      .map((monthlyEntries) => ({
        user: monthlyEntries.user,
        entries: agiledaySortMonthlyUserEntriesByProjectAndTask(monthlyEntries.entries),
      }));
    if (!entries || entries.length === 0) {
      return 'No time entries found';
    }

    const reportPaths = [];
    entries.forEach((userEntries) => {
      Object.keys(userEntries.entries).forEach((projectId) => {
        const projectEntries = userEntries.entries[projectId];
        const escapedProjectName = projectEntries.projectName.replace(/(\W+)/gi, '_');
        const fileName = `${userEntries.user.lastName}_${escapedProjectName}_${year}_${month}.pdf`;
        const filePath = `${tmpdir()}/${fileName}`;
        logger.info(`Writing billing report to ${filePath}`);
        writeBillingReport(filePath, userEntries.user, projectEntries);
        reportPaths.push(filePath);
      });
    });
    logger.info(`Sending billing report to ${email}`);
    await emailer(config).sendEmail(email, 'Monthly agileday billing reports', `${year}-${month}`, reportPaths);
    reportPaths.forEach((path) => unlinkSync(path));
    return `Billing reports (agileday) sent to email ${email}.`;
  };

  const generateWorkingHoursReport = async (
    yearArg,
    monthArg,
    rangeArg,
    email,
  ) => {
    const analyzer = analyze(config);
    const range = rangeArg ? parseInt(rangeArg, 10) : 6;
    if (range < 1 || range > 12) {
      return 'Invalid range';
    }

    const userName = validateEmail(email);
    if (!userName) {
      return `Invalid email domain for ${email}`;
    }

    const users = await harvestTracker.getUsers();
    const authorisedUser = users.find(
      (user) => user.access_roles.includes('administrator') && validateEmail(user.email) === userName,
    );
    if (!authorisedUser) {
      return `Unable to authorise harvest user ${email}`;
    }

    const year = parseInt(yearArg, 10);
    const month = parseInt(monthArg, 10);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, 1);
    endDate.setMonth(month + range - 1);
    endDate.setDate(0);

    const numOfWeekdays = countWeekdays(startDate, endDate);
    const rawTimeEntries = await harvestTracker.getTimeEntries(startDate, endDate);
    const selectedUsers = users.filter((user) => user.is_active && !user.is_contractor);
    const reportData = harvestSortRawTimeEntriesByUser(rawTimeEntries, selectedUsers)
      .map((userData) => analyzer.getWorkingHoursReportData(userData, numOfWeekdays));

    const title = `working-hours-${startDate.getFullYear()}-${startDate.getMonth() + 1}-${endDate.getFullYear()}-${endDate.getMonth() + 1}`;
    const fileName = `${title}.xlsx`;
    const filePath = `${tmpdir()}/${fileName}`;

    excel().writeWorkbook(
      filePath,
      [{
        rows: reportData,
        title,
        headers: config.workingHoursReportHeaders,
        columns: [
          { index: 0, width: 20 },
          { index: 1, width: 15 },
          { index: 2, width: 15 },
          { index: 3, width: 15 },
          { index: 4, width: 15 },
          { index: 5, width: 15 },
        ],
      }],
    );

    await emailer(config).sendEmail(authorisedUser.email, 'Working hours report', title, [filePath]);
    unlinkSync(filePath);
    return `Working hours report sent to email ${authorisedUser.email}.`;
  };

  const sendSlackReminder = async (email, missingDates) => {
    const userInfo = await slack.getUserInfoForEmail(email);
    if (userInfo.ok) {
      if (!userInfo.deleted && !userInfo.is_restricted && !userInfo.is_ultra_restricted) {
        const dateList = missingDates.map((date) => `- ${date}`).join('\n');
        const message = 'Hi!\n\n'
          + 'Based on my AI-based algorithm, you have hours missing from Harvest and this is the last day of the month. '
          + 'Please be sure to fill in your hours by the end of the day!\n\n'
          + 'The dates with missing hours are:\n'
          + `${dateList}\n\n`
          + 'Remember, no one expects the Spanish Inquistion.';
        const response = await slack.postDirectMessage(userInfo.user.id, message);
        if (response.ok) {
          logger.info(`Sent Slack reminder to ${email}`);
        } else {
          logger.error(`Sending Slack reminder to ${email} failed: ${response.error}`);
        }
      } else {
        logger.error(`Slack user ${email} has been deleted or is a quest user, reminder not sent`);
      }
    } else {
      logger.error(`No Slack user info found for ${email}`);
    }
  };

  const fetchMissingWorkhourDatesforUsers = async (year, month, users) => {
    const workingDays = calendar.getWorkingDaysForMonth(year, month);
    const entries = await harvestTracker.getMonthlyTimeEntries(year, month);
    return users.reduce((result, user) => {
      const datesWithEntries = entries
        .filter((entry) => entry.user.id === user.id)
        .map((entry) => entry.spent_date);
      const missingDates = workingDays
        .map((date) => date.toISOString().split('T')[0])
        .filter((date) => !datesWithEntries.includes(date));
      return missingDates.length > 0
        ? { ...result, [user.email]: missingDates }
        : result;
    }, {});
  };

  const sendMonthlyReminders = async (
    yearArg,
    monthArg,
    emailArg,
    checkIfLastWorkingDay = true,
  ) => {
    const year = yearArg ? parseInt(yearArg, 10) : calendar.CURRENT_YEAR;
    const month = monthArg ? parseInt(monthArg, 10) : calendar.CURRENT_MONTH + 1;
    const workingDays = calendar.getWorkingDaysForMonth(year, month);
    const lastWorkingDay = workingDays[workingDays.length - 1];
    const isLastWorkingDay = calendar.CURRENT_DATE.toDateString() === lastWorkingDay.toDateString();
    if (!checkIfLastWorkingDay || isLastWorkingDay) {
      const users = (await harvestTracker.getUsers())
        .filter((user) => user.is_active
          && !user.is_contractor
          && (!emailArg || emailArg === user.email));
      const missingDatesByUser = await fetchMissingWorkhourDatesforUsers(year, month, users);

      await Promise.all(Object.keys(missingDatesByUser)
        .map((email) => sendSlackReminder(email, missingDatesByUser[email])));
      logger.info('Monthly reminders sent');
    } else {
      logger.info('It is not the last working day of month, reminders not sent');
    }
  };

  const generateMissingWorkHoursReport = async (reportEmail) => {
    if (!reportEmail || reportEmail.length === 0) {
      logger.warn('email is missing, cannot generate report, exiting');
      return;
    }

    const year = calendar.CURRENT_MONTH > 0 ? calendar.CURRENT_YEAR : calendar.CURRENT_YEAR - 1;
    const previousMonth = calendar.CURRENT_MONTH > 0 ? calendar.CURRENT_MONTH : 12;

    logger.info(`Fetching users and entries for year ${year} month ${previousMonth} from timetracker`);
    const users = (await harvestTracker.getUsers())
      .filter((user) => user.is_active
        && !user.is_contractor
        && !user.roles.includes['non-invoicable']);

    const missingDatesByUser = await fetchMissingWorkhourDatesforUsers(year, previousMonth, users);

    logger.info('Fetched and sorted entries, generate workbook');

    const usersWithMissingHours = Object.keys(missingDatesByUser);

    const workbookData = usersWithMissingHours
      .map((email) => {
        const user = users.find((usr) => usr.email === email);
        const missingDates = missingDatesByUser[email];
        return missingDates.map((date, i) => ([(i > 0 ? '' : `${user.first_name} ${user.last_name}`), date]));
      }).flat(1);

    logger.info(`Workbook length ${workbookData.length} rows from ${usersWithMissingHours.length} users`);

    const title = `missing-working-hours-${year}-${previousMonth}`;
    const fileName = `${title}.xlsx`;
    const filePath = `${tmpdir()}/${fileName}`;

    try {
      excel().writeWorkbook(
        filePath,
        [{
          rows: workbookData,
          title,
          headers: ['name', 'date'],
          columns: [
            { index: 0, width: 20 },
            { index: 1, width: 15 },
          ],
        }],
      );
      await emailer(config).sendEmail(reportEmail, 'Working hours report', title, [filePath]);
      logger.info('Monthly missing hours report sent');
    } catch (error) {
      logger.error(`Monthly missing hours report failed. Error: ${error}`);
    } finally {
      unlinkSync(filePath);
    }
  };

  return {
    generateFlextime,
    generateHarvestStats,
    generateAgiledayStats,
    generateHarvestBillingReports,
    generateAgiledayBillingReports,
    generateWorkingHoursReport,
    sendMonthlyReminders,
    generateMissingWorkHoursReport,
  };
};
