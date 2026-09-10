import { parseTaskRequest, TaskInputError } from '../../../lib/task';

export async function POST(request: Request) {
  try {
    return Response.json({ ok: true, result: await parseTaskRequest(request) });
  } catch (error) {
    const code = error instanceof TaskInputError ? error.message : 'TASK_REQUEST_INVALID';
    return Response.json({ ok: false, error: code }, { status: 400 });
  }
}
