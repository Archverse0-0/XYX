import { z } from 'zod';
import { address } from './index.js';
const deployedAddress=address.refine((value)=>value.toLowerCase()!=='0x0000000000000000000000000000000000000000',{message:'must be a deployed non-zero address'});
export const commonConfig=z.object({
  DATABASE_URL:z.string().min(1),ARC_RPC_URL:z.string().url(),CIRCLE_AGENT_ADDRESS:deployedAddress,
  CIRCLE_API_KEY:z.string().min(1),CIRCLE_ENTITY_SECRET:z.string().min(1),
  GRAPH_URL:z.string().url(),GRAPH_DEPLOYMENT_ID:z.string().min(1),MAX_GRAPH_LAG_BLOCKS:z.coerce.number().int().nonnegative().default(50),
  EVIDENCE_REGISTRY_ADDRESS:deployedAddress,XYX_EVALUATOR_ADDRESS:deployedAddress,
  IPFS_API_URL:z.string().url(),IPFS_AUTHORIZATION:z.string().optional(),
  INTERNAL_SERVICE_TOKEN:z.string().min(32),
});
export const apiConfig=commonConfig.extend({
  PRIVY_APP_ID:z.string().min(1),PRIVY_VERIFICATION_KEY:z.string().min(1),OPERATOR_PRIVY_DID:z.string().startsWith('did:privy:'),
  WITNESS_URL:z.string().url(),LLM_COMPLETIONS_URL:z.string().url(),LLM_MODEL:z.string().min(1),LLM_API_KEY:z.string().min(1),
  API_PORT:z.coerce.number().int().default(3001),
  CIRCLE_PROVIDER_ADDRESS:address.optional(),
  CIRCLE_PROVIDER_WALLET:address.optional(),
});
export const witnessConfig=commonConfig.extend({
  WITNESS_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),RELAYER_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  EVALUATOR_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),WITNESS_PORT:z.coerce.number().int().default(3002),
  MAX_JOB_USDC:z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/).default('5'),
});
export function loadConfig<T extends z.ZodTypeAny>(schema:T):z.output<T> {
  const parsed=schema.safeParse(process.env);
  if(!parsed.success)throw new Error('CONFIGURATION_REQUIRED: '+parsed.error.issues.map(i=>i.path.join('.')).join(', '));
  return parsed.data;
}
