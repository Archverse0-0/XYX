import { parseAbi, type Abi } from 'viem';
import registryArtifact from '../../contracts/out/XYXEvidenceRegistry.sol/XYXEvidenceRegistry.json';
import evaluatorArtifact from '../../contracts/out/XYXEvaluator.sol/XYXEvaluator.json';
export const registryAbi=registryArtifact.abi as Abi;
export const evaluatorAbi=evaluatorArtifact.abi as Abi;
export const receiptAnchorAbi=parseAbi([
  'function anchored(bytes32) view returns (bool)',
  'function anchorReceipt((bytes32 providerKey,bytes32 endpointKey,bytes32 specHash,address payer,uint128 amountPaid,bytes32 paymentHash,bytes32 requestHash,bytes32 responseHash,bytes32 evidenceHash,bytes32 evidenceURIHash,uint32 latencyMs,uint16 httpStatus,uint8 outcome,uint64 observedAt,uint64 nonce,address providerAgentRegistry,uint256 providerAgentId) receipt,string evidenceURI,bytes signature) returns (bytes32)',
]);
