// Accepts either a bare Todoist task ID or a Todoist app URL pointing at a
// task. Returns the canonical task ID, or null if the input matches neither
// shape.
//
// URL shapes seen in practice:
//   https://todoist.com/showTask/9356343951
//   https://todoist.com/app/task/6gQFRVf9fPC94PR9
//   https://www.todoist.com/app/task/6gQFRVf9fPC94PR9
//   https://app.todoist.com/app/task/test-task-6gXXfXVrWJJQHRP6
//
// Modern Todoist URLs include a slug-prefixed ID like `<slug>-<id>`. The
// real ID is the trailing alphanumeric segment; Todoist task IDs themselves
// never contain hyphens or underscores, so it's safe to strip everything up
// to and including the last hyphen.

// Group 1: trailing alphanumeric ID (slug-prefix optional and discarded).
const URL_PATTERN =
  /^https?:\/\/(?:(?:www|app)\.)?todoist\.com\/(?:app\/)?(?:task|showTask)\/(?:[^/?#\s]*-)?([A-Za-z0-9]+)/;

// Bare token may be just the ID or `<slug>-<id>`. Group 1: trailing ID.
const BARE_PATTERN = /^(?:[A-Za-z0-9_-]*-)?([A-Za-z0-9]+)$/;

export const parseTaskRef = (input: string): string | null => {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  const urlMatch = trimmed.match(URL_PATTERN);
  if (urlMatch) {
    return urlMatch[1];
  }

  const bareMatch = trimmed.match(BARE_PATTERN);
  if (bareMatch) {
    return bareMatch[1];
  }

  return null;
};
