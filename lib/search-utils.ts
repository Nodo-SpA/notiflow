const normalizeSearchValue = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export const matchesSearchQuery = (query: string, ...fields: Array<string | null | undefined>) => {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeSearchValue(fields.filter(Boolean).join(' '));
  if (!haystack) return false;
  return normalizedQuery.split(' ').every((term) => haystack.includes(term));
};
