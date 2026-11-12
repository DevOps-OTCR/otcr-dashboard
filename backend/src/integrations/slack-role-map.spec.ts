import { Role } from '@prisma/client';
import { suggestRoleFromSlackTitle } from './slack-role-map';

describe('suggestRoleFromSlackTitle', () => {
  test.each([
    ['consultant', Role.CONSULTANT],
    ['  Project-Manager ', Role.PM],
    ['LEAD CONSULTANT', Role.LC],
    ['lc', Role.LC],
    ['pm', Role.PM],
    ['partner', Role.PARTNER],
    ['executive', Role.EXECUTIVE],
    ['Executive Board', Role.EXECUTIVE],
    ['Senior Consultant', Role.CONSULTANT],
    ['Project   Manager', Role.PM],
  ])('maps %p to %s', (title, expected) => {
    expect(suggestRoleFromSlackTitle(title)).toBe(expected);
  });

  test.each(['admin', 'Administrator', 'President', 'Director'])(
    'never maps %p to ADMIN',
    (title) => {
      const result = suggestRoleFromSlackTitle(title);
      expect(result).not.toBe(Role.ADMIN);
      expect(result).toBeNull();
    },
  );

  test.each(['Former Project Manager', 'Project Manager Intern', 'Consultant Alumni'])(
    'does not substring-match %p',
    (title) => {
      expect(suggestRoleFromSlackTitle(title)).toBeNull();
    },
  );

  test.each([null, undefined, '', '   ', 'unknown title', '────────'])(
    'returns null for %p',
    (title) => {
      expect(suggestRoleFromSlackTitle(title as string | null | undefined)).toBeNull();
    },
  );
});
