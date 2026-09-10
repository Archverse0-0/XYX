export const MAX_TASK_TEXT_BYTES = 4_096;
export const MAX_TASK_REQUEST_BYTES = 8_192;

export type TaskResult = { normalized: string };

export class TaskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskInputError';
  }
}

export function normalizeTask(input: unknown): TaskResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TaskInputError('TASK_INPUT_INVALID');
  }
  const text = (input as Record<string, unknown>).text;
  if (typeof text !== 'string') throw new TaskInputError('TASK_TEXT_REQUIRED');
  if (Buffer.byteLength(text, 'utf8') > MAX_TASK_TEXT_BYTES) {
    throw new TaskInputError('TASK_TEXT_TOO_LARGE');
  }

  const normalized = text.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new TaskInputError('TASK_TEXT_REQUIRED');
  return { normalized };
}

export async function parseTaskRequest(request: Request): Promise<TaskResult> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_TASK_REQUEST_BYTES) {
    throw new TaskInputError('TASK_REQUEST_TOO_LARGE');
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_TASK_REQUEST_BYTES) {
    throw new TaskInputError('TASK_REQUEST_TOO_LARGE');
  }

  try {
    return normalizeTask(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof TaskInputError) throw error;
    throw new TaskInputError('TASK_JSON_INVALID');
  }
}
