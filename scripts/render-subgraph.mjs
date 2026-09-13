import { readFile, writeFile } from 'node:fs/promises';
const required=['EVIDENCE_REGISTRY_ADDRESS','EVALUATOR_ADDRESS','EVIDENCE_START_BLOCK','EVALUATOR_START_BLOCK','ERC8183_START_BLOCK','ERC8004_START_BLOCK'];
const env=process.env;
const manifest=JSON.parse(await readFile('deployments/arc-testnet.json','utf8'));
const values={
  EVIDENCE_REGISTRY_ADDRESS:env.EVIDENCE_REGISTRY_ADDRESS??manifest.contracts?.XYXEvidenceRegistry?.address,
  EVALUATOR_ADDRESS:env.EVALUATOR_ADDRESS??env.XYX_EVALUATOR_ADDRESS??manifest.contracts?.XYXEvaluator?.address,
  EVIDENCE_START_BLOCK:env.EVIDENCE_START_BLOCK??String(manifest.contracts?.XYXEvidenceRegistry?.startBlock??''),
  EVALUATOR_START_BLOCK:env.EVALUATOR_START_BLOCK??String(manifest.contracts?.XYXEvaluator?.startBlock??''),
  ERC8183_START_BLOCK:env.ERC8183_START_BLOCK??String(manifest.graph?.startBlock??''),
  ERC8004_START_BLOCK:env.ERC8004_START_BLOCK??String(manifest.graph?.startBlock??''),
};
for(const name of required)if(!values[name])throw new Error(`Missing ${name}; render only after the real Arc deployment exists.`);
for(const name of ['EVIDENCE_REGISTRY_ADDRESS','EVALUATOR_ADDRESS'])if(!/^0x[0-9a-fA-F]{40}$/.test(values[name]))throw new Error(`Invalid ${name}`);
for(const name of ['EVIDENCE_START_BLOCK','EVALUATOR_START_BLOCK','ERC8183_START_BLOCK','ERC8004_START_BLOCK'])if(!/^\d+$/.test(values[name]))throw new Error(`Invalid ${name}`);
const source=await readFile('packages/subgraph/subgraph.yaml.template','utf8');
let output=source;for(const [key,value] of Object.entries(values))output=output.replaceAll(`__${key}__`,value);
await writeFile('packages/subgraph/subgraph.yaml',output,{mode:0o600});
console.log('Rendered packages/subgraph/subgraph.yaml from configured deployments.');
