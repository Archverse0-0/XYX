import { JobCreated, BudgetSet, JobFunded, JobSubmitted, JobCompleted, JobRejected, JobExpired } from '../generated/AgenticCommerce/AgenticCommerce';
import { Job } from '../generated/schema';
import { BigInt } from '@graphprotocol/graph-ts';
export function handleJobCreated(event: JobCreated): void {const j=new Job(event.params.jobId.toString());j.client=event.params.client;j.provider=event.params.provider;j.evaluator=event.params.evaluator;j.budget=BigInt.fromI32(0);j.status='Open';j.createdAt=event.block.timestamp;j.expiredAt=event.params.expiredAt;j.transactionHash=event.transaction.hash;j.save();}
export function handleBudgetSet(event: BudgetSet): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.budget=event.params.amount;j.save();}
export function handleJobFunded(event: JobFunded): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.status='Funded';j.save();}
export function handleJobSubmitted(event: JobSubmitted): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.status='Submitted';j.deliverableHash=event.params.deliverable;j.save();}
export function handleJobCompleted(event: JobCompleted): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.status='Completed';j.reasonHash=event.params.reason;j.resolvedAt=event.block.timestamp;j.save();}
export function handleJobRejected(event: JobRejected): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.status='Rejected';j.reasonHash=event.params.reason;j.resolvedAt=event.block.timestamp;j.save();}
export function handleJobExpired(event: JobExpired): void {const j=Job.load(event.params.jobId.toString());if(!j)return;j.status='Expired';j.resolvedAt=event.block.timestamp;j.save();}
