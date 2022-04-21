import { tmpdir } from 'os';
import { unlinkSync } from 'fs';

import log from '../log';

import analyze from './analyzer';
import excel from './excel';
import cal from './calendar';
import harvest from './harvest';
import emailer from './emailer';
import writeBillingReport from './pdf';

export default (config, http, slack) => {
  const logger = log(config);
  const formatDate = (date) => date.toLocaleDateString(
    'en-US',
    {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    },
  );
  const validateEmail = (email, emailParts = email.split('@')) => (config.emailDomains.includes(emailParts[1]) ? emailParts[0] : null);

  const analyzer = analyze(config);
  const calendar = cal();
  const tracker = harvest(config, http);
  const round = (val) => Math.floor(val * 2) / 2;

  const calcFlextime = async (email) => {
    const userName = validateEmail(email);
    if (!userName) {
      return { header: `Invalid email domain for ${email}` };
    }

    logger.info(`Fetch data for ${email}`);

    const entries = await tracker.getTimeEntriesForEmail(userName, validateEmail);
    if (!entries) {
      return { header: `Unable to find time entries for ${email}` };
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

  const sortRawTimeEntriesByUser = (rawTimeEntries, users, includeNonBillable = true) => {
    const orderValue = (a, b) => (a < b ? -1 : 1);
    const compare = (a, b) => (a === b ? 0 : orderValue(a, b));
    const sortedUsers = users.sort(
      (a, b) => compare(a.first_name, b.first_name) || compare(a.last_name, b.last_name),
    );
    const timeEntries = sortedUsers.map(({ id }) => rawTimeEntries
      .filter((entry) => entry.user.id === id)
      .filter((entry) => includeNonBillable || entry.billable)
      .map(({
        spent_date: date, hours, billable, notes,
        project: { id: projectId, name: projectName },
        task: { id: taskId, name: taskName },
      }) => ({
        date, hours, billable, projectId, projectName, taskId, taskName, notes,
      })));
    return timeEntries.reduce((result, entries, index) => {
      const user = sortedUsers[index];
      return entries.length > 0 || user.is_active
        ? [...result, { user, entries }]
        : result;
    },
    []);
  };

  const generateMonthlyHoursStats = async (
    invoicableEntries,
    nonInvoicableEntries,
    contractorEntries,
    year,
    month,
  ) => {
    const workDaysInMonth = calendar.getWorkingDaysTotalForMonth(year, month);
    return [
      { name: 'CALENDAR DAYS', days: workDaysInMonth },
      {},
      { name: 'INVOICABLE' },
      ...invoicableEntries.map((userData) => analyzer.getHoursStats(userData, workDaysInMonth)),
      {},
      { name: 'NON-INVOICABLE' },
      ...nonInvoicableEntries.map((userData) => analyzer.getHoursStats(userData, workDaysInMonth)),
      {},
      { name: 'CONTRACTORS' },
      ...contractorEntries.map((userData) => analyzer.getHoursStats(userData, workDaysInMonth)),
    ];
  };

  const generateMonthlyBillingStats = async (entries) => {
    const taskRates = await tracker.getTaskAssignments();
    return analyzer.getBillableStats(entries, taskRates);
  };

  const generateStats = async (
    yearArg,
    monthArg,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    const userName = validateEmail(email);
    if (!userName) {
      return `Invalid email domain for ${email}`;
    }

    const users = await tracker.getUsers();
    const authorisedUser = users.find(
      (user) => user.is_admin && validateEmail(user.email) === userName,
    );
    if (!authorisedUser) {
      return `Unable to authorise harvest user ${email}`;
    }

    const rawTimeEntries = await tracker.getMonthlyTimeEntries(year, month);
    const allEntries = sortRawTimeEntriesByUser(rawTimeEntries, users);
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

    const monthlyHoursRows = await generateMonthlyHoursStats(
      entriesByType.invoicable,
      entriesByType.nonInvoicable,
      entriesByType.contractors,
      year,
      month,
    );
    const monthlyBillingRows = await generateMonthlyBillingStats(allEntries);

    const fileName = `${year}-${month}-hours-${new Date().getTime()}.xlsx`;
    const filePath = `${tmpdir()}/${fileName}`;
    logger.info(`Writing stats to ${filePath}`);
    excel().writeStatsWorkbook(
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
    await emailer(config).sendEmail(authorisedUser.email, 'Monthly harvest stats', `${year}-${month}`, [filePath]);
    unlinkSync(filePath);
    return `Stats sent to email ${authorisedUser.email}.`;
  };

  const sortMonthlyUserEntriesByProjectAndTask = (entries) => entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((previous, entry) => {
      const result = previous;
      result[entry.projectId] = result[entry.projectId]
        || { projectName: entry.projectName, totalHours: 0, tasks: {} };
      result[entry.projectId].totalHours += entry.hours;
      result[entry.projectId].tasks[entry.taskId] = result[entry.projectId].tasks[entry.taskId]
        || { taskName: entry.taskName, totalHours: 0, entries: [] };
      result[entry.projectId].tasks[entry.taskId].totalHours += entry.hours;
      result[entry.projectId].tasks[entry.taskId].entries.push(entry);
      return result;
    }, {});

  const generateBillingReports = async (
    yearArg,
    monthArg,
    lastNames,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    const userName = validateEmail(email);
    if (!userName) {
      return `Invalid email domain for ${email}`;
    }

    const users = await tracker.getUsers();
    const authorisedUser = users.find(
      (user) => user.is_admin && validateEmail(user.email) === userName,
    );
    if (!authorisedUser) {
      return `Unable to authorise harvest user ${email}`;
    }

    const selectedUsers = users.filter((user) => lastNames.includes(user.last_name.toLowerCase()));
    const rawTimeEntries = await tracker.getMonthlyTimeEntries(year, month);
    const entries = sortRawTimeEntriesByUser(rawTimeEntries, selectedUsers, false)
      .map((monthlyEntries) => ({
        user: {
          firstName: monthlyEntries.user.first_name,
          lastName: monthlyEntries.user.last_name,
        },
        entries: sortMonthlyUserEntriesByProjectAndTask(monthlyEntries.entries),
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

    await emailer(config).sendEmail(authorisedUser.email, 'Monthly harvest billing reports', `${year}-${month}`, reportPaths);
    reportPaths.forEach((path) => unlinkSync(path));
    return `Billing reports sent to email ${authorisedUser.email}.`;
  };

  const generateWorkingHoursReport = async (
    yearArg,
    monthArg,
    email,
    year = parseInt(yearArg, 10),
    month = parseInt(monthArg, 10),
  ) => {
    const userName = validateEmail(email);
    if (!userName) {
      return `Invalid email domain for ${email}`;
    }

    const users = await tracker.getUsers();
    const authorisedUser = users.find(
      (user) => user.is_admin && validateEmail(user.email) === userName,
    );
    if (!authorisedUser) {
      return `Unable to authorise harvest user ${email}`;
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month - 1, 1);
    endDate.setMonth(month + (month > 6 ? 6 : 5));
    endDate.setDate(0);

    const rawTimeEntries = await tracker.getTimeEntries(startDate, endDate);
    const entriesByUser = sortRawTimeEntriesByUser(rawTimeEntries, users);

    console.log(JSON.stringify(entriesByUser, null, 2));

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

  const sendMonthlyReminders = async (
    yearArg,
    monthArg,
    emailArg,
    checkIfLastDayOfMonth = true,
  ) => {
    if (!checkIfLastDayOfMonth || calendar.IS_LAST_DAY_OF_MONTH) {
      const year = yearArg ? parseInt(yearArg, 10) : calendar.CURRENT_YEAR;
      const month = monthArg ? parseInt(monthArg, 10) : calendar.CURRENT_MONTH + 1;
      const users = (await tracker.getUsers())
        .filter((user) => user.is_active && (!emailArg || emailArg === user.email));
      const entries = await tracker.getMonthlyTimeEntries(year, month);
      const workingDays = calendar.getWorkingDaysForMonth(year, month);

      const missingDatesByUser = users.reduce((result, user) => {
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

      await Promise.all(Object.keys(missingDatesByUser)
        .map((email) => sendSlackReminder(email, missingDatesByUser[email])));
      logger.info('Monthly reminders sent');
    } else {
      logger.info('It is not the last day of month, reminders not sent');
    }
  };

  return {
    calcFlextime,
    generateStats,
    generateBillingReports,
    generateWorkingHoursReport,
    sendMonthlyReminders,
  };
};
