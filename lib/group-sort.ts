const groupNameCollator = new Intl.Collator('es', {
  numeric: true,
  sensitivity: 'base',
});

const normalizeGroupName = (value?: string | null) =>
  (value || '').trim().replace(/\s+/g, ' ');

export const compareGroupNames = (a?: string | null, b?: string | null) =>
  groupNameCollator.compare(normalizeGroupName(a), normalizeGroupName(b));

export const sortGroupsByName = <T extends { name?: string | null }>(groups: T[]) =>
  [...groups].sort((a, b) => compareGroupNames(a?.name, b?.name));
