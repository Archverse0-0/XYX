import { NewFeedback, FeedbackRevoked } from '../generated/ERC8004Reputation/ReputationRegistry';
import { AgentIdentity, Feedback } from '../generated/schema';
import { BigInt } from '@graphprotocol/graph-ts';

function feedbackId(agentId: BigInt, client: string, index: BigInt): string {
  return agentId.toString() + '-' + client + '-' + index.toString();
}

export function handleNewFeedback(event: NewFeedback): void {
  const agent = AgentIdentity.load(event.params.agentId.toString());
  if (!agent) return;
  const entity = new Feedback(feedbackId(event.params.agentId, event.params.clientAddress.toHex(), event.params.feedbackIndex));
  entity.agent = agent.id;
  entity.client = event.params.clientAddress;
  entity.feedbackIndex = event.params.feedbackIndex;
  entity.value = event.params.value;
  entity.valueDecimals = event.params.valueDecimals;
  entity.indexedTag = event.params.indexedTag1;
  entity.tag1 = event.params.tag1;
  entity.tag2 = event.params.tag2;
  entity.endpoint = event.params.endpoint;
  entity.feedbackURI = event.params.feedbackURI;
  entity.feedbackHash = event.params.feedbackHash;
  entity.revoked = false;
  entity.updatedAt = event.block.timestamp;
  entity.save();
}

export function handleFeedbackRevoked(event: FeedbackRevoked): void {
  const entity = Feedback.load(feedbackId(event.params.agentId, event.params.clientAddress.toHex(), event.params.feedbackIndex));
  if (!entity) return;
  entity.revoked = true;
  entity.updatedAt = event.block.timestamp;
  entity.save();
}
