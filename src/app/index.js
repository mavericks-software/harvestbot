import { tmpdir } from 'os';
import { unlinkSync } from 'fs';

import log from '../log';

import analyze from './analyzer';
import excel from './excel';
import cal from './calendar';
import harvest from './harvest';
import emailer from './emailer';
import writeBillingReport from './pdf';

export default (config, http) => {
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

  const getMonthlyEntriesByUser = async (users, year, month, includeNonBillable = true) => {
    const orderValue = (a, b) => (a < b ? -1 : 1);
    const compare = (a, b) => (a === b ? 0 : orderValue(a, b));
    const sortedUsers = users.sort(
      (a, b) => compare(a.first_name, b.first_name) || compare(a.last_name, b.last_name),
    );

    const rawTimeEntries = await tracker.getMonthlyTimeEntries(year, month);
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
    const workDaysInMonth = calendar.getWorkingDaysForMonth(year, month);
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

    const allEntries = await getMonthlyEntriesByUser(users, year, month);
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

  const sortEntriesByProjectAndDate = (entries) => entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((previous, entry) => {
      const result = previous;
      result[entry.projectId] = result[entry.projectId] || [];
      result[entry.projectId].push(entry);
      return result;
    }, {});

  const generateReports = async (
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
    const entries = (await getMonthlyEntriesByUser(selectedUsers, year, month, false))
      .map((monthlyEntries) => ({
        user: {
          firstName: monthlyEntries.user.first_name,
          lastName: monthlyEntries.user.last_name,
        },
        entries: sortEntriesByProjectAndDate(monthlyEntries.entries),
      }));

    const reportPaths = [];
    entries.forEach((userEntries) => {
      Object.keys(userEntries.entries).forEach((projectId) => {
        const projectEntries = userEntries.entries[projectId];
        // eslint-disable-next-line prefer-destructuring
        const projectName = projectEntries[0].projectName;
        const escapedProjectName = projectName.replace(/(\W+)/gi, '_');
        const fileName = `${userEntries.user.lastName}_${escapedProjectName}_${year}_${month}.pdf`;
        const filePath = `${tmpdir()}/${fileName}`;
        logger.info(`Writing report to ${filePath}`);
        writeBillingReport(filePath, userEntries.user, projectName, projectEntries);
        reportPaths.push(filePath);
      });
    });

    await emailer(config).sendEmail(authorisedUser.email, 'Monthly harvest billing reports', `${year}-${month}`, reportPaths);
    reportPaths.forEach((path) => unlinkSync(path));
    return `Reports sent to email ${authorisedUser.email}.`;
  };

  return {
    calcFlextime,
    generateStats,
    generateReports,
  };
};
