import { EMPTY } from 'rxjs';
import {
  expand,
  first,
  map,
  mergeMap,
  reduce,
} from 'rxjs/operators';
import { DateTime } from 'luxon';

export default (config, http) => {
  const api = http(
    'https://api.harvestapp.com/v2/',
    {
      Authorization: `Bearer ${config.harvestAccessToken}`,
      'Harvest-Account-Id': config.harvestAccountId,
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
      first(({ email }) => userName === validateEmail(email)),
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
