import { Registered } from '../generated/ERC8004Identity/IdentityRegistry';
import { AgentIdentity } from '../generated/schema';
import { Address } from '@graphprotocol/graph-ts';
export function handleRegistered(event: Registered): void {const id=event.params.agentId.toString();let entity=new AgentIdentity(id);entity.registry=event.address;entity.agentId=event.params.agentId;entity.owner=event.params.owner;entity.agentURI=event.params.agentURI;entity.registeredAtBlock=event.block.number;entity.save();}
