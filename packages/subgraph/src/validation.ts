import { ValidationResponse } from '../generated/ERC8004Validation/ValidationRegistry';
import { Validation } from '../generated/schema';
export function handleValidationResponse(event: ValidationResponse): void {const id=event.params.requestHash.toHex();let v=Validation.load(id);if(!v){v=new Validation(id);}v.agent=event.params.agentId.toString();v.validator=event.params.validatorAddress;v.response=event.params.response;v.tag=event.params.tag;v.requestHash=event.params.requestHash;v.responseHash=event.params.responseHash;v.updatedAt=event.block.timestamp;v.save();}
