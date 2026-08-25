export default {
  admins: [
    'U077YLRKE3H', // Matti Rautia
    'U04Q49ZH1EW', // Jouni Jaakkola
    'U01T7BHD9C4', // Kirsi Kytökorpi
    'U06DU8UP0AH', // Jessica Bendtsson
    'U06V9RMCZA5', // Anna-Kaisa Tolvanen
    'U2BGL8ACA', // Teemu Tiilikainen
    'U09CY1MATU6', // Jenni Suuronen
  ],
  // Users who may run `report` but not `stats` or `hours`.
  // Full access lives in `admins` above; do not list the same id in both.
  // `report` is NOT data-scoped: anyone listed here can pull billing reports,
  // hour rates included, for any last name. See "Access levels" in the README.
  // Must stay an array of ids. A comma-separated string will be rejected.
  reportOnlyUsers: [
    'U0155FBU0FL', // Robin Mäki
    'U08TU8W9SQL', // Jaakko Saikkonen
  ],
  missingWorkhoursReportEmail: 'anna-kaisa.arvo@witted.com',
  emailDomains: 'mavericks.fi,witted.com',
  harvestAccountId: '988127',
  harvestAccountIds: 'mavericks:988127,witted:107593',
  // Currently not in use
  notifyChannelId: null,
  hoursStatsColumnHeaders: [
    'Name',
    'Working days',
    'Full hours',
    'Done hours',
    'Billable',
    'Project',
    'Billable%',
    'Plus / minus',
    'Internally invoicable, hours',
    'Sick leave, hours',
    'Sick leave - child"s sickness, hours',
    'Paid vacation, days',
    'Unpaid vacation, days',
    'Parental leave, days',
    'Extra paid leave, days',
    'Paid vacation dates',
    'Marked days',
    'Missing days',
  ],
  billableStatsColumnHeaders: [
    'Project',
    'Task',
    'Hour rate',
    'Consultant',
    'Hours',
    'EUR',
    'Avg hour rate',
  ],
  workingHoursReportHeaders: [
    'Name',
    'Non-vacation days',
    'Vacation days',
    'Working weeks',
    'Max working hours',
    'Total working hours',
  ],
  taskIds: {
    vacation: '11369141',
    unpaidLeave: '1369142',
    parentalLeave: '18450208',
    sickLeave: '11369140',
    sickLeaveChildsSickness: '18406328',
    extraPaidLeave: '13538291',
    internallyInvoicable: '14655092',
  },
  agiledayTaskNames: {
    vacation: 'annual holiday',
    unpaidLeave: 'unpaid leave',
    parentalLeave: 'parental leave',
    sickLeave: 'sick leave',
    sickLeaveChildsSickness: 'child sick',
    extraPaidLeave: 'extra paid leave',
    internallyInvoicable: 'internally invoiceable',
  },
};
