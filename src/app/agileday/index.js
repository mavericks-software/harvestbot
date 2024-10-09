import { DateTime } from 'luxon';
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
      hours: entry.actualHours,
      billable: entry.billable,
      projectId: entry.projectId,
      projectName: entry.projectName,
      taskId: entry.projectTask.toLowerCase(),
      taskName: entry.projectTask,
      notes: entry.note,
    })));
  return timeEntries.reduce((result, entries, index) => {
    const user = sortedUsers[index];
    return entries.length > 0
      ? [...result, { user, entries }]
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

  const getMonthlyRangeQueryString = (year, month) => `&startDate=${DateTime.local(year, month, 1).toISODate()}&endDate=${DateTime.local(year, month, 1).endOf('month').toISODate()}`;

  const getAllUsers = () => {
    const url = '/employee';
    return api.getJson(url);
  };

  const getMonthlyTimeEntries = (year, month) => {
    const url = `/time_reporting?${getMonthlyRangeQueryString(year, month)}&status=submitted`;
    return api.getJson(url);
  };

  return {
    getUsers: (...args) => toPromise(getAllUsers, ...args),
    getMonthlyTimeEntries: (...args) => toPromise(getMonthlyTimeEntries, ...args),
  };
};
