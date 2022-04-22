import moment from 'moment';
import cal from '../calendar';

export default ({ taskIds }) => {
  const calendar = cal();
  const sortByDate = (a, b) => new Date(a.date) - new Date(b.date);

  const isPublicHoliday = (taskId) => taskId === taskIds.publicHoliday;
  const isPaidVacation = (taskId) => taskId === taskIds.vacation;
  const isUnpaidLeave = (taskId) => taskId === taskIds.unpaidLeave;
  const isParentalLeave = (taskId) => taskId === taskIds.parentalLeave;
  const isFlexLeave = (taskId) => taskId === taskIds.flexLeave;
  const isExtraPaidLeave = (taskId) => taskId === taskIds.extraPaidLeave;
  const isSickLeave = (taskId) => taskId === taskIds.sickLeave;
  const isChildsSickness = (taskId) => taskId === taskIds.sickLeaveChildsSickness;
  const isProductServiceDevelopment = (taskId) => taskId === taskIds.productServiceDevelopment;
  const isInternallyInvoicable = (taskId) => taskId === taskIds.internallyInvoicable;
  const isHoliday = (taskId) => isPublicHoliday(taskId)
    || isPaidVacation(taskId)
    || isUnpaidLeave(taskId);
  const isHolidayOrFlex = (taskId) => isHoliday(taskId) || isFlexLeave(taskId);
  const countsTowardsTotalWorkHours = (entry) => entry.billable
    || isSickLeave(entry.taskId)
    || isChildsSickness(entry.taskId)
    || isInternallyInvoicable(entry.taskId)
    || isProductServiceDevelopment(entry.taskId);

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
      const isCurrentMonthEntry = !ignoreFromTotal && isCurrentMonth(entryDate);

      return {
        ...result,
        total: ignoredTask ? result.total : result.total + entry.hours,
        billable: isCurrentMonthEntry && entry.billable
          ? result.billable + entry.hours
          : result.billable,
        nonBillable: isCurrentMonthEntry && !entry.billable
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
        vacation,
        unpaidLeave,
        parentalLeave,
        extraPaidLeave,
      },
    } = result;
    if (dates.includes(entry.date)) {
      return result;
    }
    return {
      dates: [...dates, entry.date],
      daysCount: {
        working: isHoliday(entry.taskId) ? working : working + 1,
        vacation: isPaidVacation(entry.taskId) ? vacation + 1 : vacation,
        unpaidLeave: isUnpaidLeave(entry.taskId) ? unpaidLeave + 1 : unpaidLeave,
        parentalLeave: isParentalLeave(entry.taskId) ? parentalLeave + 1 : parentalLeave,
        extraPaidLeave: isExtraPaidLeave(entry.taskId) ? extraPaidLeave + 1 : extraPaidLeave,
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
          vacationDates: isPaidVacation(entry.taskId)
            ? result.vacationDates.concat([moment(entry.date, 'YYYY-MM-DD').date()])
            : result.vacationDates,
          hours: dayInfo.isWorkingOrSickDay
            ? result.hours + entry.hours
            : result.hours,
          billableHours: dayInfo.isBillable
            ? result.billableHours + entry.hours
            : result.billableHours,
          sickLeaveHours: isSickLeave(entry.taskId)
            ? result.sickLeaveHours + entry.hours
            : result.sickLeaveHours,
          childsSicknessHours: isChildsSickness(entry.taskId)
            ? result.childsSicknessHours + entry.hours
            : result.childsSicknessHours,
          productServiceDevelopmentHours: isProductServiceDevelopment(entry.taskId)
            ? result.productServiceDevelopmentHours + entry.hours
            : result.productServiceDevelopmentHours,
          internallyInvoicableHours: isInternallyInvoicable(entry.taskId)
            ? result.internallyInvoicableHours + entry.hours
            : result.internallyInvoicableHours,
          projectNames: projectNotAdded
            ? [...result.projectNames, entry.projectName]
            : result.projectNames,
        };
      },
      {
        dates: [],
        daysCount: {
          working: 0,
          vacation: 0,
          unpaidLeave: 0,
          parentalLeave: 0,
          extraPaidLeave: 0,
        },
        vacationDates: [],
        hours: 0,
        billableHours: 0,
        sickLeaveHours: 0,
        childsSicknessHours: 0,
        productServiceDevelopmentHours: 0,
        internallyInvoicableHours: 0,
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
    internallyInvoicableHours: recordedHours.internallyInvoicableHours,
    productServiceDevelopmentHours: recordedHours.productServiceDevelopmentHours,
    sickLeaveHours: recordedHours.sickLeaveHours,
    childsSicknessHours: recordedHours.childsSicknessHours,
    vacationDays: recordedHours.daysCount.vacation,
    unpaidLeaveDays: recordedHours.daysCount.unpaidLeave,
    parentalLeaveDays: recordedHours.daysCount.parentalLeave,
    extraPaidLeaveDays: recordedHours.daysCount.extraPaidLeave,
    vacationDates: recordedHours.vacationDates.sort().join(','),
    markedDays: recordedHours.dates.length,
    missingDays: recordedHours.dates.length - fullCalendarDays,
  });

  const getWorkingHoursReportData = ({ user, entries }, numOfWeekdays) => {
    const recordedHours = entries.reduce(
      (result, entry) => ({
        nonVacationDays: isPaidVacation(entry.taskId)
          ? result.nonVacationDays - 1
          : result.nonVacationDays,
        totalWorkHours: countsTowardsTotalWorkHours(entry)
          ? result.totalWorkHours + entry.hours
          : result.totalWorkHours,
        billable: entry.billable
          ? result.billableHours + entry.hours
          : result.billableHours,
        productServiceDevelopmentHours: isProductServiceDevelopment(entry.taskId)
          ? result.productServiceDevelopmentHours + entry.hours
          : result.productServiceDevelopmentHours,
        internallyInvoicableHours: isInternallyInvoicable(entry.taskId)
          ? result.internallyInvoicableHours + entry.hours
          : result.internallyInvoicableHours,
        sickLeaveHours: isSickLeave(entry.taskId)
          ? result.sickLeaveHours + entry.hours
          : result.sickLeaveHours,
        childsSicknessHours: isChildsSickness(entry.taskId)
          ? result.childsSicknessHours + entry.hours
          : result.childsSicknessHours,
      }),
      {
        nonVacationDays: numOfWeekdays,
        totalWorkHours: 0,
        billableHours: 0,
        productServiceDevelopmentHours: 0,
        internallyInvoicableHours: 0,
        sickLeaveHours: 0,
        childsSicknessHours: 0,
      },
    );
    const totalWorkWeeks = recordedHours.nonVacationDays / 5;
    return {
      name: `${user.first_name} ${user.last_name}`,
      active: user.is_active ? 'yes' : 'no',
      nonVacationDays: recordedHours.nonVacationDays,
      vacationDays: numOfWeekdays - recordedHours.nonVacationDays,
      totalWorkWeeks,
      maxWorkHours: totalWorkWeeks * 48,
      totalWorkHours: recordedHours.totalWorkHours,
      billableHours: recordedHours.billableHours,
      internallyInvoicableHours: recordedHours.internallyInvoicableHours,
      productServiceDevelopmentHours: recordedHours.productServiceDevelopmentHours,
      sickLeaveHours: recordedHours.sickLeaveHours,
      childsSicknessHours: recordedHours.childsSicknessHours,
    };
  };

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
    getWorkingHoursReportData,
  };
};
