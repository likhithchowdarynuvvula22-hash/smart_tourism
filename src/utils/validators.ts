const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a standard 36-character hexadecimal UUID.
 */
export const isValidUuid = (id: unknown): boolean => {
  if (typeof id !== "string") {
    return false;
  }
  return UUID_REGEX.test(id.trim());
};

export const validateUUID = isValidUuid;

/**
 * Validates whether a string matches ISO YYYY-MM-DD format.
 */
export const validateDate = (date: unknown): boolean => {
  if (typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

export interface ParsedPagination {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

/**
 * Parses and bounds pagination parameters from request query parameters.
 */
export const parsePagination = (
  query: Record<string, unknown>,
  defaultPageSize: number = 10,
  maxPageSize: number = 100
): ParsedPagination => {
  const rawPageVal = Array.isArray(query.page) ? query.page[0] : query.page;
  const rawPageSizeVal = Array.isArray(query.pageSize)
    ? query.pageSize[0]
    : Array.isArray(query.limit)
      ? query.limit[0]
      : query.pageSize || query.limit;

  const rawPage = Number(rawPageVal);
  const rawPageSize = Number(rawPageSizeVal);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, maxPageSize)
      : defaultPageSize;

  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  return {
    page,
    pageSize,
    offset,
    limit
  };
};

/**
 * Validates and sanitizes a search query string.
 */
export const validateSearchQuery = (
  query: unknown,
  maxLength: number = 100
): string | undefined => {
  if (typeof query !== "string") return undefined;
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
};

/**
 * Validates and bounds an array of UUIDs.
 */
export const validateIdArray = (ids: unknown, maxItems: number = 50): string[] => {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((id): id is string => typeof id === "string" && isValidUuid(id))
    .slice(0, maxItems);
};
