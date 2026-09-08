import { JobVerdictExecuted } from '../generated/XYXEvaluator/XYXEvaluator';
import { Job } from '../generated/schema';
export function handleVerdict(event: JobVerdictExecuted): void {let job=Job.load(event.params.jobId.toString());if(!job)return;job.status=event.params.decision===1?'Completed':'Rejected';job.reasonHash=event.params.reasonHash;job.resolvedAt=event.block.timestamp;job.save();}
