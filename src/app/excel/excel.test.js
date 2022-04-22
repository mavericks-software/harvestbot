import { tmpdir } from 'os';
import { statSync, unlinkSync } from 'fs';

import excel from './index';

describe('Excel', () => {
  const writer = excel();

  describe('writeWorkbook', () => {
    it('calculate total work hours since date', () => {
      const fileName = `${tmpdir()}/temp.xlsx`;
      writer.writeWorkbook(
        fileName,
        [{
          rows: [{ name: 'name' }],
          title: 'Title',
          headers: [],
          columns: [],
        }],
      );
      expect(statSync(fileName)).toBeTruthy();
      unlinkSync(fileName);
    });
  });
});
