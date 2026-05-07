// Accepts either a bare Todoist task ID or a Todoist app URL of the form
// https://todoist.com/app/task/{id} (with optional trailing slash and query
// string). Returns the canonical task ID, or null if the input matches
// neither shape.

const URL_PATTERN =
  /^https?:\/\/(?:www\.)?todoist\.com\/(?:app\/)?(?:task|showTask)\/([A-Za-z0-9_-]+)/;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const parseTaskRef = (input: string): string | null => {
  const trimmed = input.trim();

  const urlMatch = trimmed.match(URL_PATTERN);
  if (urlMatch) {
    return urlMatch[1];
  }

  if (ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return null;
};
