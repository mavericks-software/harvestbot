import JSPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function writeBillingReport(
  filePath,
  user,
  projectName,
  projectEntries,
) {
  const hoursTotal = projectEntries.reduce((total, entry) => total + entry.hours, 0);
  const entryRows = projectEntries.map((entry) => [entry.date, entry.notes, entry.hours]);

  const doc = new JSPDF();
  doc.setFont('Helvetica', 'normal');

  autoTable(doc, {
    theme: 'plain',
    showHead: 'never',
    styles: { fontSize: 16 },
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Detailed time report', 'Mavericks'],
    ],
  });

  autoTable(doc, {
    theme: 'plain',
    showHead: 'never',
    body: [
      ['Consultant', `${user.firstName} ${user.lastName}`, '', ''],
      ['Project', projectName, '', ''],
      ['Total hours', hoursTotal, '', ''],
    ],
  });

  autoTable(doc, {
    theme: 'striped',
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    didParseCell: (hookData) => {
      if (hookData.section === 'head') {
        if (hookData.column.dataKey === 2) {
          // eslint-disable-next-line no-param-reassign
          hookData.cell.styles.halign = 'right';
        }
      }
    },
    alternateRowStyles: { fillColor: [220, 220, 220] },
    columnStyles: { 2: { halign: 'right' } },
    head: [['Date', 'Notes', 'Hours']],
    body: [
      ...entryRows,
      ['', '',
        {
          content: `Total ${hoursTotal}`,
          styles: { fontStyle: 'bold' },
        },
      ],
    ],
  });

  doc.save(filePath);
}
