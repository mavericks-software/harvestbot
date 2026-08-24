import authorize, { commands } from './index';

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

  it('denies rather than throws when config lists are missing', () => {
    const empty = authorize({});
    commands.forEach((command) => {
      expect(empty.canRunCommand(ADMIN, command)).toBe(false);
    });
  });

  it('exposes exactly the commands the dispatcher handles', () => {
    expect(commands.sort()).toEqual(['hours', 'report', 'stats']);
  });
});
