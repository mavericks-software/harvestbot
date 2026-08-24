import baseConfig from '../settings/baseConfig';
import authorize, { commands, groups } from './index';

describe('Auth', () => {
  const ADMIN = 'U000ADMIN';
  const REPORTER = 'U000REPORT';
  const STRANGER = 'U000OTHER';

  const auth = authorize({
    admins: [ADMIN],
    reportOnlyUsers: [REPORTER],
  });

  it('lets admins run every command', () => {
    commands.forEach((command) => {
      expect(auth.canRunCommand(ADMIN, command)).toBe(true);
    });
  });

  it('lets report-only users run report', () => {
    expect(auth.canRunCommand(REPORTER, 'report')).toBe(true);
  });

  it('denies report-only users the other commands', () => {
    expect(auth.canRunCommand(REPORTER, 'stats')).toBe(false);
    expect(auth.canRunCommand(REPORTER, 'hours')).toBe(false);
  });

  it('denies users in no list', () => {
    commands.forEach((command) => {
      expect(auth.canRunCommand(STRANGER, command)).toBe(false);
    });
  });

  it('denies unknown commands, even for admins', () => {
    expect(auth.canRunCommand(ADMIN, 'rm')).toBe(false);
    expect(auth.canRunCommand(ADMIN, '')).toBe(false);
    expect(auth.canRunCommand(ADMIN, undefined)).toBe(false);
    expect(auth.canRunCommand(ADMIN, 'constructor')).toBe(false);
  });

  it('denies a missing user id', () => {
    commands.forEach((command) => {
      expect(auth.canRunCommand(undefined, command)).toBe(false);
      expect(auth.canRunCommand('', command)).toBe(false);
    });
  });

  it('denies rather than throws when config lists are missing', () => {
    [{}, { admins: null }, { admins: 0 }, { admins: {} }].forEach((config) => {
      const empty = authorize(config);
      commands.forEach((command) => {
        expect(empty.canRunCommand(ADMIN, command)).toBe(false);
      });
    });
  });

  it('denies a list written as a comma string instead of an array', () => {
    const stringy = authorize({ admins: `${ADMIN},${STRANGER}` });
    // Would be a substring match if the shape were not checked.
    expect(stringy.canRunCommand(ADMIN, 'stats')).toBe(false);
    expect(stringy.canRunCommand('U000', 'stats')).toBe(false);
  });

  it('has a command map with exactly the keys the dispatcher switches on', () => {
    expect([...commands].sort()).toEqual(['hours', 'report', 'stats']);
  });

  it('names only groups that exist as arrays in the real config', () => {
    groups.forEach((group) => {
      expect(Array.isArray(baseConfig[group])).toBe(true);
    });
  });
});
