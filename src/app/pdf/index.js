import moment from 'moment';
import JSPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function writeBillingReport(
  filePath,
  user,
  projectEntries,
) {
  const taskIds = Object.keys(projectEntries.tasks);
  const writeTaskHeaders = taskIds.length > 0;
  const headerIndexes = [];
  const entryRows = taskIds.reduce((rows, taskId) => {
    const taskEntries = projectEntries.tasks[taskId];
    if (writeTaskHeaders) {
      rows.push([
        {
          content: taskEntries.taskName,
          colSpan: 2,
        },
        {
          content: taskEntries.totalHours.toFixed(2),
          styles: { halign: 'right' },
        },
      ]);
      headerIndexes.push(rows.length - 1);
    }
    taskEntries.entries.forEach((entry) => rows.push([
      moment(entry.date, 'YYYY-MM-DD').format('DD.MM.YYYY'),
      entry.notes,
      entry.hours,
    ]));
    return rows;
  }, []);

  const doc = new JSPDF();
  doc.setFont('Helvetica', 'normal');

  autoTable(doc, {
    theme: 'plain',
    showHead: 'never',
    styles: { fontSize: 16 },
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Detailed time report', 'Witted'],
    ],
  });

  autoTable(doc, {
    theme: 'plain',
    showHead: 'never',
    body: [
      ['Consultant', `${user.firstName} ${user.lastName}`, '', ''],
      ['Project', projectEntries.projectName, '', ''],
      ['Total hours', projectEntries.totalHours, '', ''],
    ],
  });

  autoTable(doc, {
    theme: 'plain',
    headStyles: {
      fontStyle: 'normal',
      fillColor: [220, 220, 220],
      textColor: [0, 0, 0],
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'head') {
        if (hookData.column.dataKey === 2) {
          // eslint-disable-next-line no-param-reassign
          hookData.cell.styles.halign = 'right';
        }
      }
      if (headerIndexes.includes(hookData.row.index) || hookData.row.index === entryRows.length) {
        // eslint-disable-next-line no-param-reassign
        hookData.cell.styles.fillColor = [220, 220, 220];
      }
    },
    columnStyles: { 2: { halign: 'right' } },
    head: [['Date', 'Notes', 'Hours']],
    body: [
      ...entryRows,
      ['',
        {
          content: `Total ${projectEntries.totalHours.toFixed(2)}`,
          styles: { halign: 'right' },
          colSpan: 2,
        },
      ],
    ],
  });

  doc.save(filePath);
}
