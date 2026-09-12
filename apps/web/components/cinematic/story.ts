/** Conceptual choreography only. Never connected to live operational state. */
export const chapters = [
  { id:'opening', label:'The evidence engine', title:'XYX', text:'Trust infrastructure for machines that pay machines.', detail:'Every economic action should leave something more than a transaction.', signal:'EXPOSE / YIELD / EXECUTE' },
  { id:'authority', label:'Human authority', title:'Autonomy begins\nwith permission.', text:'A human authorizes the funds. A machine operates within that authority.', detail:'Privy establishes the human wallet. A real Arc funding transaction gives the Buyer Agent its spending budget.', signal:'HUMAN → PRIVY → FUNDING → BUYER AGENT' },
  { id:'discover', label:'Discover', title:'Access is only\nthe beginning.', text:'What can the agent buy?', detail:'Circle Marketplace provides machine-readable discovery. Each endpoint must be inspected for capability, price, and a compatible payment path.', signal:'ABSTRACT ENDPOINTS / NOT LIVE PROVIDERS' },
  { id:'assess', label:'Assess', title:'Evidence gives\nchoice its weight.', text:'A history of outcomes. A measure of uncertainty.', detail:'The Graph supplies indexed memory. XYX weighs price, observed receipts, reliability, confidence, and address diversity. Validation is considered only when available; runtime integration is partial.', signal:'XYX OBSERVED EVIDENCE' },
  { id:'select', label:'Select', title:'Many possibilities.\nOne reasoned path.', text:'Hard constraints first. Deterministic selection second.', detail:'Your policy removes ineligible paths. Observable evidence informs a decision for this transaction—not a claim of universal reputation.', signal:'CONSTRAINTS → EVIDENCE → SELECTION' },
  { id:'execute', label:'Execute', title:'A decision becomes\nconsequential.', text:'The selected service meets the machine payment path.', detail:'The Witness reinspects the endpoint before executing through Circle. Open Purchase pays the external provider directly. It does not provide XYX escrow or refunds.', signal:'BUYER AGENT → CIRCLE → EXTERNAL PROVIDER' },
  { id:'verify', label:'Observe / Verify', title:'What happened\nis what matters.', text:'Execution becomes a cryptographic commitment.', detail:'Payment reference. HTTP status. Request and response commitments. Latency, outcome, timestamp. The centralized Witness canonicalizes observed facts into signed evidence.', signal:'OBSERVATION → CANONICALIZATION → COMMITMENT' },
  { id:'record', label:'Record', title:'An action ends.\nIts evidence remains.', text:'What happened becomes reusable.', detail:'Content-addressed evidence is bound to a signed receipt. XYXEvidenceRegistry anchors the commitment on Arc; The Graph indexes its event as queryable memory.', signal:'EVIDENCE → REGISTRY → ARC → THE GRAPH' },
  { id:'learn', label:'Learn', title:'The next decision\nstarts with more.', text:'Commerce produces evidence. Evidence informs commerce.', detail:'A subsequent Graph query can bring the new receipt into another risk assessment. This feedback loop still requires live end-to-end verification.', signal:'PREVIOUS OUTCOME → MEMORY → NEXT DECISION' },
  { id:'protected', label:'Protected commerce', title:'When the stakes\nrequire a boundary.', text:'A distinct mode for discrete, higher-value work.', detail:'ERC-8183 owns job escrow and settlement. XYX evaluates the submitted work. Backend integration exists; product controls and live lifecycle verification remain incomplete.', signal:'OPEN → FUNDED → SUBMITTED → COMPLETED / REJECTED' },
  { id:'closing', label:'Expose. Yield. Execute.', title:'Accountability.\nBuilt into the loop.', text:'XYX is the risk, verification, and settlement layer for autonomous agent commerce.', detail:'Explore the Buyer Agent and the evidence behind its decisions.', signal:'MACHINE COMMERCE / WITH CONSEQUENCE' },
] as const;

export type MotionState = { chapter:number; expansion:number; rotation:number; tilt:number; cameraX:number; cameraY:number; cameraZ:number; targetX:number; nodes:number; selection:number; flow:number; memory:number; protection:number; light:number; seal:number };
export const initialMotion: MotionState = { chapter:0, expansion:.12, rotation:-.35, tilt:.2, cameraX:5.8, cameraY:3.6, cameraZ:10, targetX:-1.7, nodes:0, selection:0, flow:0, memory:0, protection:0, light:.32, seal:0 };
export const poses: Partial<MotionState>[] = [
  initialMotion,
  { expansion:.28, rotation:.1, cameraX:4.6, cameraY:2.8, cameraZ:9, light:1.05, flow:.3 },
  { expansion:.48, rotation:.35, cameraX:3.2, cameraY:4.2, cameraZ:10.5, nodes:1, flow:0 },
  { expansion:.9, rotation:.65, cameraX:1.6, cameraY:2.7, cameraZ:8.8, memory:.5, tilt:.1 },
  { expansion:.45, rotation:1.0, cameraX:4, cameraY:3.2, cameraZ:9.8, selection:1, memory:.2 },
  { expansion:.24, rotation:1.35, cameraX:5.3, cameraY:1.2, cameraZ:8, flow:1, light:1.45 },
  { expansion:.03, rotation:1.57, cameraX:2.7, cameraY:4.7, cameraZ:7.8, nodes:0, flow:0, memory:0, seal:1, light:1.75 },
  { expansion:.07, rotation:1.75, cameraX:4.8, cameraY:4.4, cameraZ:10.5, memory:.8, seal:1 },
  { expansion:.48, rotation:2.3, cameraX:6.2, cameraY:5.2, cameraZ:12, memory:1, nodes:1, selection:.5, flow:.4, seal:0 },
  { expansion:.16, rotation:2.7, cameraX:3.8, cameraY:3.8, cameraZ:10, protection:1, nodes:0, memory:.25, flow:0, seal:.6 },
  { expansion:.05, rotation:3.14, cameraX:3, cameraY:2.4, cameraZ:10.5, protection:0, memory:.1, light:1.2, seal:1 },
];
