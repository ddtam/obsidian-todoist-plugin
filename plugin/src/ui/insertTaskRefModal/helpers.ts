import type { Task } from "@/data/task";

const MAX_SUGGESTIONS = 50;

export const filterTasksForPicker = (tasks: Task[], query: string): Task[] => {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return tasks.slice(0, MAX_SUGGESTIONS);
  }

  const matches = tasks.filter((t) => {
    if (t.content.toLowerCase().includes(trimmed)) {
      return true;
    }
    if (t.project.name.toLowerCase().includes(trimmed)) {
      return true;
    }
    return false;
  });

  return matches.slice(0, MAX_SUGGESTIONS);
};

export const buildTaskRefCodeBlock = (taskId: string): string => {
  return `\`\`\`todoist-task\nid: ${taskId}\n\`\`\`\n`;
};
