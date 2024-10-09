import xlsx from 'xlsx';

export default () => {
  const CHAR_CODE_A = 65;

  // TODO: error handling
  const writeWorkbook = (filePath, sheets) => {
    const book = xlsx.utils.book_new();
    sheets.map((
      {
        rows,
        title,
        headers,
        columns,
      },
    ) => {
      const sheet = xlsx.utils.json_to_sheet(rows);
      headers.map((label, index) => {
        if (!sheet[String.fromCharCode(CHAR_CODE_A + index) + 1]) {
          sheet[String.fromCharCode(CHAR_CODE_A + index) + 1] = {};
        }
        sheet[String.fromCharCode(CHAR_CODE_A + index) + 1].v = label;
        return true;
      });
      if (!sheet['!cols']) {
        sheet['!cols'] = [];
      }
      columns.map(({ index, width }) => {
        sheet['!cols'][index] = { wch: width };
        return index;
      });

      return xlsx.utils.book_append_sheet(book, sheet, title);
    });
    xlsx.writeFile(book, filePath);
  };

  return {
    writeWorkbook,
  };
};
