import { z } from 'zod';
import { address } from './index.js';
import { usdcAmount } from './jobs.js';
import commerceDeployment from '../../erc8183/deployment.json' with { type: 'json' };
const deployedAddress=address.refine((value)=>value.toLowerCase()!=='0x0000000000000000000000000000000000000000',{message:'must be a deployed non-zero address'});
const storageConfig=z.object({
  IPFS_PROVIDER:z.enum(['kubo','pinata']).default('kubo'),IPFS_API_URL:z.string().url().optional(),IPFS_AUTHORIZATION:z.string().optional(),
  IPFS_GATEWAY_URL:z.string().url().optional(),PINATA_JWT:z.string().min(1).optional(),
});
function validateStorage(value:z.infer<typeof storageConfig>,ctx:z.RefinementCtx) {
  if(value.IPFS_PROVIDER==='kubo'&&!value.IPFS_API_URL)ctx.addIssue({code:'custom',path:['IPFS_API_URL'],message:'required for Kubo storage'});
  if(value.IPFS_PROVIDER==='pinata'){
    if(!value.PINATA_JWT)ctx.addIssue({code:'custom',path:['PINATA_JWT'],message:'required for Pinata storage'});
    if(!value.IPFS_GATEWAY_URL)ctx.addIssue({code:'custom',path:['IPFS_GATEWAY_URL'],message:'required for Pinata storage'});
  }
}
const baseConfig=z.object({
  DATABASE_URL:z.string().min(1),ARC_RPC_URL:z.string().url(),CIRCLE_AGENT_ADDRESS:deployedAddress,
  GRAPH_URL:z.string().url(),GRAPH_DEPLOYMENT_ID:z.string().min(1),MAX_GRAPH_LAG_BLOCKS:z.coerce.number().int().nonnegative().default(50),
  EVIDENCE_REGISTRY_ADDRESS:deployedAddress,XYX_EVALUATOR_ADDRESS:deployedAddress,
  INTERNAL_SERVICE_TOKEN:z.string().min(32),
  ERC8183_ADDRESS:deployedAddress.default(commerceDeployment.address),
  MAX_JOB_USDC:usdcAmount.default('5'),
}).merge(storageConfig);
// Circle credentials authorize machine-wallet execution only. Evidence signing,
// evidence storage, and evaluator verdict preparation must not possess them.
const circleExecutionConfig=z.object({CIRCLE_API_KEY:z.string().min(1),CIRCLE_ENTITY_SECRET:z.string().min(1)});
export const commonConfig=baseConfig.merge(circleExecutionConfig);
export const apiConfig=commonConfig.extend({
  PRIVY_APP_ID:z.string().min(1),PRIVY_VERIFICATION_KEY:z.string().min(1),OPERATOR_PRIVY_DID:z.string().startsWith('did:privy:'),
  WITNESS_URL:z.string().url(),LLM_COMPLETIONS_URL:z.string().url(),LLM_MODEL:z.string().min(1),LLM_API_KEY:z.string().min(1),
  API_PORT:z.coerce.number().int().default(3001),
  PROTECTED_JOB_PROVIDER_ADDRESS:address.optional(),
}).superRefine(validateStorage);
export const witnessConfig=baseConfig.extend({
  WITNESS_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),RELAYER_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  EVALUATOR_PRIVATE_KEY:z.string().regex(/^0x[0-9a-fA-F]{64}$/),WITNESS_PORT:z.coerce.number().int().default(3002),
  EVIDENCE_START_BLOCK:z.coerce.number().int().nonnegative().default(0),
}).superRefine(validateStorage);
export function loadConfig<T extends z.ZodTypeAny>(schema:T,env:Record<string,string|undefined>=process.env):z.output<T> {
  if(schema===(apiConfig as unknown)&&['WITNESS_PRIVATE_KEY','RELAYER_PRIVATE_KEY','EVALUATOR_PRIVATE_KEY'].some(name=>!!env[name]))
    throw new Error('API_SIGNING_SECRETS_FORBIDDEN');
  const parsed=schema.safeParse(env);
  if(!parsed.success)throw new Error('CONFIGURATION_REQUIRED: '+parsed.error.issues.map(i=>i.path.join('.')).join(', '));
  return parsed.data;
}
