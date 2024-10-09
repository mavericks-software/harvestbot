import { EMPTY } from 'rxjs';
import {
  expand,
  first,
  map,
  mergeMap,
  reduce,
  catchError,
} from 'rxjs/operators';
import { DateTime } from 'luxon';
import log from '../../log';

export const harvestSortRawTimeEntriesByUser = (
  rawTimeEntries,
  users,
  includeNonBillable = true,
) => {
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

export const harvestSortMonthlyUserEntriesByProjectAndTask = (entries) => entries
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

export const harvestGenerateMonthlyHoursStats = async (
  analyzer,
  calendar,
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

export default (config, http, harvestAccount = 'mavericks') => {
  const logger = log(config);

  logger.info(`Using Harvest account ${harvestAccount}`);
  const harvestAccessToken = config.harvestAccessTokens
  && config.harvestAccessTokens[harvestAccount]
    ? config.harvestAccessTokens[harvestAccount]
    : config.harvestAccessToken;
  const harvestAccountId = config.harvestAccountIds && config.harvestAccountIds[harvestAccount]
    ? config.harvestAccountIds[harvestAccount]
    : config.harvestAccountId;

  const api = http(
    'https://api.harvestapp.com/v2/',
    {
      Authorization: `Bearer ${harvestAccessToken}`,
      'Harvest-Account-Id': harvestAccountId,
    },
  );

  const getRangeQueryString = (year) => `&from=${year}-01-01&to=${year}-12-31`;
  const getMonthlyRangeQueryString = (year, month) => `&from=${DateTime.local(year, month, 1).toISODate()}&to=${DateTime.local(year, month, 1).endOf('month').toISODate()}`;

  const collect = (result, item) => [...result, item];

  const getAllToPromise = (
    getAll,
    ...args
  ) => getAll(...args)
    .pipe(
      reduce(collect, []),
    )
    .toPromise();

  const nextOrEmpty = (get, ...args) => ({ nextPage }) => (
    nextPage ? get(...args, nextPage) : EMPTY
  );

  const getUserTimeEntriesForPage = (userId, year, page) => api
    .getJson(`/time_entries?user_id=${userId}&page=${page}${year
      ? getRangeQueryString(year)
      : ''}`)
    .pipe(
      map(({ next_page: nextPage, time_entries: entries }) => ({ entries, nextPage })),
    );

  const getMonthlyTimeEntriesForPage = (year, month, page) => {
    const url = `/time_entries?page=${page}${year
      ? getMonthlyRangeQueryString(year, month)
      : ''}`;

    return api
      .getJson(url)
      .pipe(
        map(({ next_page: nextPage, time_entries: entries }) => ({ entries, nextPage })),
      );
  };

  const getTimeEntriesForPage = (startDate, endDate, page) => {
    const url = `/time_entries?page=${page}`
      + `&from=${startDate.toLocaleDateString('sv')}`
      + `&to=${endDate.toLocaleDateString('sv')}`;

    return api
      .getJson(url)
      .pipe(
        map(({ next_page: nextPage, time_entries: entries }) => ({ entries, nextPage })),
      );
  };

  const getUsersForPage = (page) => api
    .getJson(`/users?page=${page}`)
    .pipe(
      map(({ users, next_page: nextPage }) => ({ users, nextPage })),
    );

  const getTaskAssignmentsForPage = (page) => api
    .getJson(`/task_assignments?page=${page}`)
    .pipe(
      map(({ task_assignments: tasks, next_page: nextPage }) => ({ tasks, nextPage })),
    );

  const getTimeEntriesForId = (userId, year = null) => getUserTimeEntriesForPage(userId, year, 1)
    .pipe(
      expand(nextOrEmpty(getUserTimeEntriesForPage, userId, year)),
      mergeMap(({ entries }) => entries),
      map(({
        spent_date: date, hours, billable,
        project: { id: projectId, name: projectName },
        task: { id: taskId, name: taskName },
      }) => ({
        date, hours, billable, projectId, projectName, taskId, taskName,
      })),
    );

  const getAllMonthlyTimeEntries = (year, month) => getMonthlyTimeEntriesForPage(year, month, 1)
    .pipe(
      expand(nextOrEmpty(getMonthlyTimeEntriesForPage, year, month)),
      mergeMap(({ entries }) => entries),
    );

  const getAllTimeEntries = (startDate, endDate) => getTimeEntriesForPage(startDate, endDate, 1)
    .pipe(
      expand(nextOrEmpty(getTimeEntriesForPage, startDate, endDate)),
      mergeMap(({ entries }) => entries),
    );

  const getAllUsers = () => getUsersForPage(1)
    .pipe(
      expand(nextOrEmpty(getUsersForPage)),
      mergeMap(({ users }) => users),
    );

  const getAllTaskAssignments = () => getTaskAssignmentsForPage(1)
    .pipe(
      expand(nextOrEmpty(getTaskAssignmentsForPage)),
      mergeMap(({ tasks }) => tasks),
    );

  const getTimeEntriesForUserId = (
    userId,
    year,
  ) => getAllToPromise(getTimeEntriesForId, userId, year);

  const getMonthlyTimeEntries = (
    year,
    month,
  ) => getAllToPromise(getAllMonthlyTimeEntries, year, month);

  const getTimeEntries = (
    startDate,
    endDate,
  ) => getAllToPromise(getAllTimeEntries, startDate, endDate);

  const getTimeEntriesForEmail = (userName, validateEmail = () => null) => getAllUsers()
    .pipe(
      first(({ email }) => userName === validateEmail(email)), // Returns EmptyError if not found
      catchError((e) => {
        logger.error(`Error happened while getTimeEntriesForEmail Error: ${e}`);
        return [];
      }),
      mergeMap(({ id }) => getTimeEntriesForId(id)),
      reduce(collect, []),
    )
    .toPromise();

  const getUsers = () => getAllToPromise(getAllUsers);

  const getTaskAssignments = () => getAllToPromise(getAllTaskAssignments);

  return {
    getTimeEntries,
    getTimeEntriesForUserId,
    getMonthlyTimeEntries,
    getTimeEntriesForEmail,
    getUsers,
    getTaskAssignments,
  };
};
