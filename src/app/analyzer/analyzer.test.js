import analyzer from './index';

describe('Analyzer', () => {
  const mockDates = [
    { date: '2017-12-07' },
    { date: '2017-06-07' },
    { date: '2017-12-05' },
    { date: '2018-07-20' },
    { date: '2018-05-09' },
  ];

  const mockEntry = {
    date: '2018-12-20',
    hours: 7.5,
    billable: true,
    projectId: 'projectId',
    projectName: 'projectName',
    taskId: 'taskId',
    taskName: 'taskName',
  };

  const mockEntries = [
    mockEntry,
    {
      ...mockEntry,
      date: '2018-12-21',
      billable: false,
      taskId: 'flexLeaveTaskId',
    },
    {
      ...mockEntry,
      hours: 1,
      date: '2018-12-22',
    },
    {
      ...mockEntry,
      date: '2018-12-24',
    },
    {
      ...mockEntry,
      date: '2018-12-26',
      taskId: 'publicHolidayTaskId',
    },
  ];

  const mockTask = {
    user: { first_name: 'first', last_name: 'last' },
    entries: mockEntries,
  };

  const mockConfig = {
    taskIds: {
      publicHoliday: 'publicHolidayTaskId',
      vacation: '',
      unpaidLeave: '',
      sickLeave: '',
      flexLeave: 'flexLeaveTaskId',
    },
  };

  const {
    calculateWorkedHours,
    getPeriodRange,
    getHoursStats,
    getBillableStats,
  } = analyzer(mockConfig);

  describe('getPeriodRange', () => {
    it('should get start and end dates', () => expect(getPeriodRange(mockDates, new Date('2018-07-20')))
      .toEqual({
        start: new Date('2017-06-07'),
        end: new Date('2018-07-20'),
        entries: [
          { date: '2017-06-07' },
          { date: '2017-12-05' },
          { date: '2017-12-07' },
          { date: '2018-05-09' },
          { date: '2018-07-20' },
        ],
      }));
  });
  describe('calculateWorkedHours', () => {
    it('should calculate worked hours', () => expect(calculateWorkedHours(mockEntries))
      .toEqual({
        billablePercentageCurrentMonth: 0,
        total: 16,
        warnings: [],
      }));
  });
  describe('getHoursStats', () => {
    it('should get hours stats', () => expect(getHoursStats(mockTask, 3))
      .toEqual({
        billableHours: 16,
        billablePercentage: 100,
        days: 2,
        flexLeaveDays: 1,
        flexSaldo: 1,
        hours: 16,
        hoursPerCalendar: 15,
        name: 'first last',
        markedDays: 2,
        missingDays: -1,
        projectName: 'projectName',
        sickDays: 0,
        unpaidLeaveDays: 0,
        vacationDays: 0,
      }));
  });
  describe('getBillableStats', () => {
    it('should get billable stats', () => expect(
      getBillableStats(
        [mockTask],
        [{
          hourly_rate: 10,
          project: { id: 'projectId' },
          task: { id: 'taskId' },
        }],
      ),
    ).toEqual([
      {
        hours: 16, name: '', projectName: 'projectName', taskName: '', taskRate: '', total: 160,
      },
      {
        taskName: 'taskName', hours: 16, taskRate: 10, total: 160,
      },
      {
        hours: 16, name: 'first last', total: 160,
      },
      {
        total: undefined,
      },
      {
        hours: 16,
        total: 160,
        billableAvg: 10,
      },
    ]));
  });
});
