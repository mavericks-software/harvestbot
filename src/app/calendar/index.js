import finnishholidays from 'finnish-holidays-js';

export default () => {
  const HOURS_IN_DAY = 7.5;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const CURRENT_DATE = new Date();
  const CURRENT_MONTH = CURRENT_DATE.getMonth();
  const CURRENT_YEAR = CURRENT_DATE.getFullYear();
  const IS_LAST_DAY_OF_MONTH = (new Date(CURRENT_DATE.getTime() + ONE_DAY).getDate()) === 1;

  const isWeekLeave = (date) => date.getDay() === 0 || date.getDay() === 6;

  const datesEqual = (a, b) => a.getDate() === b.getDate()
    && a.getMonth() === b.getMonth()
    && a.getFullYear() === b.getFullYear();

  const isPublicHoliday = (date) => !!finnishholidays.month(date.getMonth() + 1,
    date.getFullYear()).find((it) => it.day === date.getDate());

  const isWorkingDay = (date) => !isWeekLeave(date)
    && !isPublicHoliday(date);

  const getYesterday = (date) => new Date(date.setDate(date.getDate() - 1));

  const getTotalWorkHoursSinceDate = (fromDate, toDate) => {
    let workingDate = new Date(toDate);
    let hours = 0;
    do {
      hours += isWorkingDay(workingDate) ? HOURS_IN_DAY : 0;
      workingDate = getYesterday(workingDate);
    } while (workingDate >= fromDate);
    return hours;
  };

  const getLatestFullWorkingDay = (date = new Date()) => {
    let workingDate = date;
    do {
      workingDate = getYesterday(workingDate);
    } while (!isWorkingDay(workingDate));
    return workingDate;
  };

  const getWorkingDaysTotalForMonth = (year, month) => {
    const monthStartDate = new Date(year, month - 1, 1, 12);
    const monthEndDate = new Date(year, month, 0, 12);
    const workHoursInMonth = getTotalWorkHoursSinceDate(monthStartDate, monthEndDate);
    return workHoursInMonth / HOURS_IN_DAY;
  };

  const getWorkingDaysForMonth = (year, month) => {
    const date = new Date(Date.UTC(year, month - 1, 1));
    const days = [];
    while (date.getUTCMonth() === month - 1) {
      if (isWorkingDay(date)) {
        days.push(new Date(date));
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return days;
  };

  return {
    CURRENT_MONTH,
    CURRENT_YEAR,
    IS_LAST_DAY_OF_MONTH,
    HOURS_IN_DAY,
    datesEqual,
    isWorkingDay,
    getLatestFullWorkingDay,
    getTotalWorkHoursSinceDate,
    getWorkingDaysTotalForMonth,
    getWorkingDaysForMonth,
  };
};
