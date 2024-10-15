import { DateTime } from 'luxon';
import { catchError } from 'rxjs/operators';
import log from '../../log';

export const agiledaySortRawTimeEntriesByUser = (
  rawTimeEntries,
  users,
  includeNonBillable = true,
) => {
  const orderValue = (a, b) => (a < b ? -1 : 1);
  const compare = (a, b) => (a === b ? 0 : orderValue(a, b));
  const sortedUsers = users.sort(
    (a, b) => compare(a.firstName, b.firstName) || compare(a.lastName, b.lastName),
  );
  const timeEntries = sortedUsers.map(({ id }) => rawTimeEntries
    .filter((entry) => entry.employeeId === id)
    .filter((entry) => includeNonBillable || entry.billable)
    .map((entry) => ({
      date: entry.date,
      hours: entry.actualHours || 0,
      billable: entry.billable,
      projectId: entry.projectId,
      projectName: entry.projectName,
      employeeCompany: entry.employeeCompany,
      taskHourlyPrice: entry.taskHourlyPrice,
      openingHourlyPrice: entry.openingHourlyPrice,
      taskId: entry.projectTask.toLowerCase(),
      taskName: entry.projectTask,
      notes: entry.note,
    })));
  return timeEntries.reduce((result, entries, index) => {
    const user = sortedUsers[index];
    return entries.length > 0
      ? [
        ...result,
        {
          // Used for sorting in stats
          companyName: entries[0].employeeCompany,
          user: {
            ...user,
            // TODO: first_name & last_name is for compatibility
            // with harvest data for PDF etc creation,
            // clean up after harvest implementation is removed.
            first_name: user.firstName,
            last_name: user.lastName,
          },
          entries,
        }]
      : result;
  },
  []);
};

export const agiledaySortMonthlyUserEntriesByProjectAndTask = (entries) => entries
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

export const agiledayGenerateMonthlyHoursStats = async (
  calendar,
  analyzer,
  entriesByCompany,
  year,
  month,
) => {
  const workDaysInMonth = calendar.getWorkingDaysTotalForMonth(year, month);

  return Object.keys(entriesByCompany).reduce((result, key) => {
    const entries = entriesByCompany[key];
    return [
      ...result,
      {},
      { name: key },
      ...entries.map((userData) => analyzer.getHoursStats(userData, workDaysInMonth)),
    ];
  }, [{ name: 'CALENDAR DAYS', days: workDaysInMonth }]);
};

export default (config, http) => {
  const logger = log(config);

  logger.info('Using AgileDay account');
  const apiToken = config.agiledayAccessToken;

  const api = http(
    'https://witted.agileday.io/api/v1/',
    {
      Authorization: `Bearer ${apiToken}`,
    },
  );

  const toPromise = (
    func,
    ...args
  ) => func(...args).toPromise();

  // NOTE: agileday doesn't return values for the endDate,
  // so we need to set the endDate to first day of next month.
  // The endDate is "non-inclusive".
  const getMonthlyRangeQueryString = (year, month) => {
    const thisMonthFirstDay = DateTime.local(year, month, 1).toISODate();
    const nextMonthFirstDay = DateTime.local(year, month, 1).plus({ months: 1 }).toISODate();
    return `&startDate=${thisMonthFirstDay}&endDate=${nextMonthFirstDay}`;
  };

  const getAllUsers = () => {
    const url = '/employee';
    return api.getJson(url);
  };

  const getMonthlyTimeEntries = (year, month) => {
    const url = `/time_reporting?${getMonthlyRangeQueryString(year, month)}&status=submitted`;
    console.log(url);
    return api.getJson(url)
      .pipe(
        catchError((e) => {
          if (e.message.includes('status code 404')) {
            return [];
          }
          throw e;
        }),
      );
  };

  return {
    getUsers: (...args) => toPromise(getAllUsers, ...args),
    getMonthlyTimeEntries: (...args) => toPromise(getMonthlyTimeEntries, ...args),
  };
};
