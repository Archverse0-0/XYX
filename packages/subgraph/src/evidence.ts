import { ReceiptAnchored } from '../generated/XYXEvidenceRegistry/XYXEvidenceRegistry';
import { Endpoint, Receipt } from '../generated/schema';
import { Address, BigInt } from '@graphprotocol/graph-ts';
export function handleReceiptAnchored(event: ReceiptAnchored): void {
  const id=event.params.receiptHash.toHex();const endpointId=event.params.endpointKey.toHex();
  let endpoint=Endpoint.load(endpointId);if(!endpoint){endpoint=new Endpoint(endpointId);endpoint.providerKey=event.params.providerKey;endpoint.receiptCount=BigInt.fromI32(0);endpoint.scoredSuccesses=BigInt.fromI32(0);endpoint.scoredFailures=BigInt.fromI32(0);endpoint.excludedOutcomes=BigInt.fromI32(0);endpoint.lastObservedAt=BigInt.fromI32(0);}
  endpoint.receiptCount=endpoint.receiptCount.plus(BigInt.fromI32(1));const outcome=event.params.outcome;
  if(outcome===0)endpoint.scoredSuccesses=endpoint.scoredSuccesses.plus(BigInt.fromI32(1));else if(outcome>=1&&outcome<=4)endpoint.scoredFailures=endpoint.scoredFailures.plus(BigInt.fromI32(1));else endpoint.excludedOutcomes=endpoint.excludedOutcomes.plus(BigInt.fromI32(1));
  if(event.params.observedAt>endpoint.lastObservedAt)endpoint.lastObservedAt=event.params.observedAt;endpoint.save();
  const receipt=new Receipt(id);receipt.providerKey=event.params.providerKey;receipt.endpoint=endpointId;receipt.payer=event.params.payer;receipt.amountPaid=event.params.amountPaid;receipt.specHash=event.params.specHash;receipt.paymentHash=event.params.paymentHash;receipt.requestHash=event.params.requestHash;receipt.responseHash=event.params.responseHash;receipt.evidenceHash=event.params.evidenceHash;receipt.evidenceURIHash=event.params.evidenceURIHash;receipt.evidenceURI=event.params.evidenceURI;receipt.latencyMs=event.params.latencyMs.toI32();receipt.httpStatus=event.params.httpStatus;receipt.outcome=outcome;receipt.observedAt=event.params.observedAt;receipt.blockNumber=event.block.number;receipt.transactionHash=event.transaction.hash;
  if(event.params.providerAgentRegistry.notEqual(Address.zero())){receipt.providerAgentRegistry=event.params.providerAgentRegistry;receipt.providerAgentId=event.params.providerAgentId;}receipt.save();
}
