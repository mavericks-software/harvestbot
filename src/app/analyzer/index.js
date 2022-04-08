import cal from '../calendar';

export default ({ taskIds }) => {
  const calendar = cal();
  const sortByDate = (a, b) => new Date(a.date) - new Date(b.date);

  const isPublicHoliday = (taskId) => taskId === taskIds.publicHoliday;
  const isVacation = (taskId) => taskId === taskIds.vacation;
  const isUnpaidLeave = (taskId) => taskId === taskIds.unpaidLeave;
  const isFlexLeave = (taskId) => taskId === taskIds.flexLeave;
  const isSickLeave = (taskId) => taskId === taskIds.sickLeave;
  const isHoliday = (taskId) => isPublicHoliday(taskId)
    || isVacation(taskId)
    || isUnpaidLeave(taskId);
  const isHolidayOrFlex = (taskId) => isHoliday(taskId) || isFlexLeave(taskId);

  const getPeriodRangeEnd = (entriesDate, latestFullDate, today = new Date()) => (
    calendar.datesEqual(entriesDate, today)
      ? entriesDate
      : latestFullDate
  );

  const getPeriodRange = (
    entries,
    latestFullDate,
    sortedEntries = entries.sort(sortByDate),
    latestRecordDate = new Date(sortedEntries[sortedEntries.length - 1].date),
    endDate = getPeriodRangeEnd(
      latestRecordDate,
      latestFullDate,
    ),
    sortedRangeEntries = sortedEntries.filter(
      (entry) => new Date(entry.date).getTime() <= endDate.getTime(),
    ),
  ) => ({
    entries: sortedRangeEntries, // sorted entries for range
    start: new Date(sortedEntries[0].date), // start date
    end: endDate, // today or last calendar working day
  });

  const isCurrentMonth = (date) => date.getFullYear() === calendar.CURRENT_YEAR
    && date.getMonth() === calendar.CURRENT_MONTH;

  const calculateWorkedHours = (
    entries,
    filtered = entries.reduce((result, entry) => {
      const entryDate = new Date(entry.date);
      const ignoredTask = isPublicHoliday(entry.taskId) || isFlexLeave(entry.taskId);
      const ignoreFromTotal = ignoredTask;
      const isCurrenMonthEntry = !ignoreFromTotal && isCurrentMonth(entryDate);

      return {
        ...result,
        total: ignoredTask ? result.total : result.total + entry.hours,
        billable: isCurrenMonthEntry && entry.billable
          ? result.billable + entry.hours
          : result.billable,
        nonBillable: isCurrenMonthEntry && !entry.billable
          ? result.nonBillable + entry.hours
          : result.nonBillable,
      };
    }, {
      warnings: [],
      total: 0,
      billable: 0,
      nonBillable: 0,
    }),
    allHours = filtered.billable + filtered.nonBillable,
  ) => ({
    warnings: filtered.warnings,
    total: filtered.total,
    billablePercentageCurrentMonth: allHours
      ? Math.floor((filtered.billable / (allHours)) * 100)
      : 0,
  });

  const addDayStats = (entry, result) => {
    const {
      dates,
      daysCount: {
        working,
        sickLeave,
        vacation,
        unpaidLeave,
        flexLeave,
      },
    } = result;
    if (dates.includes(entry.date)) {
      return result;
    }
    return {
      dates: [...dates, entry.date],
      daysCount: {
        working: isHoliday(entry.taskId) ? working : working + 1,
        sickLeave: isSickLeave(entry.taskId) ? sickLeave + 1 : sickLeave,
        vacation: isVacation(entry.taskId) ? vacation + 1 : vacation,
        unpaidLeave: isUnpaidLeave(entry.taskId) ? unpaidLeave + 1 : unpaidLeave,
        flexLeave: isFlexLeave(entry.taskId) ? flexLeave + 1 : flexLeave,
      },
    };
  };

  const getDayInfo = (
    entry,
    isCalendarWorkingDay = calendar.isWorkingDay(new Date(entry.date)),
    isWorkingOrSickDay = !isHolidayOrFlex(entry.taskId),
  ) => ({
    isCalendarWorkingDay,
    isWorkingOrSickDay,
    isBillable: isWorkingOrSickDay && entry.billable,
  });

  const getHoursStats = (
    { user, entries },
    fullCalendarDays,
    recordedHours = entries.reduce(
      (result, entry) => {
        const dayInfo = getDayInfo(entry);

        const projectNotAdded = dayInfo.isBillable
          && !result.projectNames.includes(entry.projectName);
        return {
          ...(dayInfo.isCalendarWorkingDay ? addDayStats(entry, result) : result),
          hours: dayInfo.isWorkingOrSickDay
            ? result.hours + entry.hours
            : result.hours,
          billableHours: dayInfo.isBillable
            ? result.billableHours + entry.hours
            : result.billableHours,
          projectNames: projectNotAdded
            ? [...result.projectNames, entry.projectName]
            : result.projectNames,
        };
      },
      {
        dates: [],
        daysCount: {
          working: 0,
          sickLeave: 0,
          vacation: 0,
          unpaidLeave: 0,
          flexLeave: 0,
        },
        hours: 0,
        billableHours: 0,
        projectNames: [],
      },
    ),
    hoursPerCalendar = recordedHours.daysCount.working * calendar.HOURS_IN_DAY,
  ) => ({
    name: `${user.first_name} ${user.last_name}`,
    days: recordedHours.daysCount.working,
    hoursPerCalendar,
    hours: recordedHours.hours,
    billableHours: recordedHours.billableHours,
    projectName: recordedHours.projectNames.join(),
    billablePercentage: (recordedHours.billableHours / recordedHours.hours) * 100,
    flexSaldo: recordedHours.hours - hoursPerCalendar,
    sickDays: recordedHours.daysCount.sickLeave,
    vacationDays: recordedHours.daysCount.vacation,
    unpaidLeaveDays: recordedHours.daysCount.unpaidLeave,
    flexLeaveDays: recordedHours.daysCount.flexLeave,
    markedDays: recordedHours.dates.length,
    missingDays: recordedHours.dates.length - fullCalendarDays,
  });

  const flattenBillableUserEntries = (entries) => entries.reduce(
    (result, { user, entries: userEntries }) => ([
      ...result,
      ...userEntries.reduce(
        (entryResult, entry) => (
          getDayInfo(entry).isBillable
            ? [...entryResult, {
              ...entry, userId: user.id, firstName: user.first_name, lastName: user.last_name,
            }]
            : entryResult
        ),
        [],
      ),
    ]), [],
  );

  const addBillableEntry = (
    projects,
    taskRates,
    {
      projectId,
      projectName,
      taskId,
      taskName,
      userId,
      hours,
      firstName,
      lastName,
    },
  ) => {
    const project = projects[projectId] || { tasks: {} };
    const task = project.tasks[taskId] || { users: {} };
    const user = task.users[userId];
    return {
      ...projects,
      [projectId]: {
        ...project,
        name: projectName,
        tasks: {
          ...project.tasks,
          [taskId]: {
            ...task,
            rate: (taskRates.find(
              ({
                project: { id: pId },
                task: { id: tId },
              }) => pId === projectId && tId === taskId,
            ) || {}).hourly_rate,
            name: taskName,
            users: {
              ...task.users,
              [userId]: {
                hours: user ? user.hours + hours : hours,
                firstName,
                lastName,
              },
            },
          },
        },
      },
    };
  };

  const addBillableUserRows = (users, taskRate) => Object
    .keys(users)
    .reduce((result, userKey) => {
      const { firstName, lastName, hours } = users[userKey];
      return [
        ...result,
        { name: `${firstName} ${lastName}`, hours, total: hours * taskRate },
      ];
    }, []);

  const addBillableTaskRows = (tasks) => Object
    .keys(tasks)
    .reduce((result, taskKey) => {
      const { name: taskName, rate: taskRate, users } = tasks[taskKey];
      const userRows = addBillableUserRows(users, taskRate);
      const sumData = userRows
        .reduce((
          values,
          { total, hours },
        ) => ({
          total: values.total + total,
          hours: values.hours + hours,
        }),
        { hours: 0, total: 0 });
      return [
        ...result,
        {
          taskName,
          taskRate,
          taskHours: sumData.hours,
          taskTotal: sumData.total,
        },
        ...userRows,
      ];
    }, []);

  const convertBillableProjectRows = (projects) => Object.keys(projects).reduce((result, item) => {
    const project = projects[item];
    const taskRows = addBillableTaskRows(project.tasks);
    const sumData = taskRows
      .reduce((
        values,
        { taskTotal, taskHours },
      ) => ({
        total: taskTotal ? values.total + taskTotal : values.total,
        hours: taskHours ? values.hours + taskHours : values.hours,
      }),
      { hours: 0, total: 0 });
    const projectHeader = {
      projectName: project.name,
      taskName: '',
      taskRate: '',
      name: '',
      projectHours: sumData.hours,
      projectTotal: sumData.total,
    };
    return [
      ...result,
      projectHeader,
      ...taskRows,
      {},
    ];
  }, []);

  const getBillableStats = (entries, taskRates) => {
    const sortedEntries = flattenBillableUserEntries(entries)
      .reduce((result, row) => addBillableEntry(result, taskRates, row), {});
    const billableStats = convertBillableProjectRows(sortedEntries);
    const sumData = billableStats
      .reduce((
        values,
        { projectTotal, projectHours },
      ) => ({
        total: projectTotal ? values.total + projectTotal : values.total,
        hours: projectHours ? values.hours + projectHours : values.hours,
      }),
      { hours: 0, total: 0 });
    return [
      ...billableStats,
      {
        billableTotal: sumData.total,
        billableHours: sumData.hours,
        billableAvg: sumData.total / sumData.hours,
      },
    ].map(({
      projectTotal, billableTotal, taskTotal, total,
      hours, taskHours, projectHours, billableHours,
      ...item
    }) => ({
      ...item,
      hours: hours || taskHours || projectHours || billableHours,
      total: total || taskTotal || projectTotal || billableTotal,
    }));
  };

  return {
    getPeriodRange,
    calculateWorkedHours,
    getHoursStats,
    getBillableStats,
  };
};
