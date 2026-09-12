# Arc Mainnet Readiness Assessment

## Executive Summary

This document is an engineering assessment of XYX's readiness for Arc mainnet deployment. It is NOT a claim of readiness — it is an honest evaluation of what exists, what needs work, and what is blocked by external availability.

## Current State: Arc Testnet

XYX is currently built for Arc Testnet (chain ID 5042002). All contract addresses, RPC configuration, and deployment assumptions target the testnet environment.

## Readiness Assessment

### Network Configuration
| Item | Status | Detail |
|------|--------|--------|
| Chain ID | READY | 5042002 (testnet), mainnet TBD |
| RPC endpoint | BLOCKED | No mainnet RPC endpoint verified |
| Gas semantics | NEEDS_WORK | Testnet gas limits may differ from mainnet |
| Block time | NEEDS_WORK | Mainnet block time not verified |

### Contract Deployment
| Item | Status | Detail |
|------|--------|--------|
| XYXEvidenceRegistry | READY_FOR_DEPLOYMENT | Code is mainnet-compatible (no testnet-specific logic) |
| XYXEvaluator | READY_FOR_DEPLOYMENT | Code is mainnet-compatible |
| OpenZeppelin 5.6.1 | READY | Standard library, no testnet assumptions |
| Deployment script | NEEDS_WORK | `scripts/deploy.ts` needs mainnet chain config |

### Role Management
| Item | Status | Detail |
|------|--------|--------|
| ATTESTOR_ROLE | READY | AccessControl pattern is chain-agnostic |
| PAUSER_ROLE | READY | AccessControl pattern is chain-agnostic |
| Admin role | READY | Default admin role works on any chain |
| Role separation | READY | Witness, evaluator, relayer, pauser are separate |

### Key Management
| Item | Status | Detail |
|------|--------|--------|
| Witness private key | BLOCKED | Requires mainnet secret management |
| Evaluator private key | BLOCKED | Requires mainnet secret management |
| Relayer private key | BLOCKED | Requires mainnet secret management |
| Key rotation | NEEDS_WORK | No rotation procedure documented |

### USDC Semantics
| Item | Status | Detail |
|------|--------|--------|
| USDC contract address | BLOCKED | Mainnet USDC address TBD |
| Decimals | READY | 6 decimals assumed throughout |
| Approval flow | READY | ERC-20 approve pattern is standard |
| Balance checks | READY | `usdcBalance()` uses standard ERC-20 reads |

### Circle Integration
| Item | Status | Detail |
|------|--------|--------|
| Developer-Controlled Wallets | BLOCKED | Requires mainnet Circle account |
| Circle CLI | BLOCKED | Requires mainnet CLI configuration |
| Wallet funding | BLOCKED | Requires mainnet USDC funding |
| Payment execution | BLOCKED | Requires mainnet marketplace providers |

### ERC-8004
| Item | Status | Detail |
|------|--------|--------|
| IdentityRegistry address | BLOCKED | Mainnet ERC-8004 deployment TBD |
| ValidationRegistry address | BLOCKED | Mainnet ERC-8004 deployment TBD |
| ReputationRegistry address | BLOCKED | Mainnet ERC-8004 deployment TBD |
| Runtime consumption | READY | Code is chain-agnostic |

### ERC-8183
| Item | Status | Detail |
|------|--------|--------|
| AgenticCommerce proxy | BLOCKED | Mainnet ERC-8183 deployment TBD |
| Service wrapper | READY | Code uses ABI, not hardcoded addresses |
| Job lifecycle | READY | create/budget/approve/fund/submit/evaluate |

### The Graph
| Item | Status | Detail |
|------|--------|--------|
| Graph Studio | BLOCKED | Requires mainnet subgraph deployment |
| Graph endpoint | BLOCKED | Requires mainnet Graph queries |
| Subgraph schema | READY | Schema is chain-agnostic |
| Graph client | READY | Code is chain-agnostic |

### Monitoring & Alerting
| Item | Status | Detail |
|------|--------|--------|
| Structured logging | NEEDS_WORK | Basic logging exists, no metrics/-alerts |
| Graph freshness monitoring | NEEDS_WORK | No external monitoring for Graph lag |
| Payment state monitoring | NEEDS_WORK | No external monitoring for unknown payment states |
| Contract event monitoring | NEEDS_WORK | No external monitoring for on-chain events |

### Rate Limits & Idempotency
| Item | Status | Detail |
|------|--------|--------|
| API rate limiting | NEEDS_WORK | No rate limiting middleware |
| Idempotency keys | READY | Fully implemented for open purchase and protected jobs |
| Reconciliation | READY | IN_FLIGHT/CONFIRMED/RECONCILIATION_REQUIRED state machine |

### Incident Response
| Item | Status | Detail |
|------|--------|--------|
| Contract pause | READY | Pausable on both contracts |
| Witness compromise | NEEDS_WORK | No documented rotation procedure |
| Evaluator compromise | NEEDS_WORK | No documented rotation procedure |
| Graph staleness | READY | Fail-closed on stale Graph data |

### Database Durability
| Item | Status | Detail |
|------|--------|--------|
| Postgres | READY | Standard Postgres, no testnet assumptions |
| Migrations | READY | SQL migrations are chain-agnostic |
| Backup | NEEDS_WORK | No backup procedure documented |

### Evidence Availability
| Item | Status | Detail |
|------|--------|--------|
| IPFS | BLOCKED | Requires mainnet IPFS endpoint |
| Content addressing | READY | CIDv1/raw leaves are standard |
| Readback verification | READY | Byte-compared before signing |

### Deployment Rollback
| Item | Status | Detail |
|------|--------|--------|
| Contract upgrade | NOT_APPLICABLE | Contracts are non-upgradeable |
| Subgraph redeployment | READY | Graph supports versioned deployments |
| API rollback | NEEDS_WORK | No rollback procedure documented |

## Known Blockers

1. **Arc mainnet RPC endpoint** — No mainnet RPC URL available
2. **Arc mainnet USDC address** — Mainnet USDC contract address TBD
3. **ERC-8183 mainnet deployment** — Reference implementation only on testnet
4. **ERC-8004 mainnet deployments** — Identity/Validation/Reputation registries TBD
5. **Circle mainnet account** — Requires production Circle Developer-Controlled Wallets
6. **Graph mainnet deployment** — Requires Graph Studio mainnet deployment
7. **IPFS mainnet endpoint** — Requires production IPFS service
8. **Secret management** — No production secret management solution configured

## Recommendation

XYX is NOT ready for Arc mainnet deployment. The core code is chain-agnostic and could be deployed to mainnet with configuration changes, but the following must be resolved first:

1. Verify Arc mainnet availability and configuration
2. Deploy ERC-8183 and ERC-8004 on mainnet (or verify existing deployments)
3. Configure Circle mainnet account with proper secret management
4. Deploy subgraph to Graph Studio mainnet
5. Configure production IPFS service
6. Document incident response procedures
7. Implement monitoring and alerting
8. Complete security audit of contract deployment parameters

## Classification

**Overall: BLOCKED_BY_EXTERNAL_AVAILABILITY**

The code is ready. The infrastructure is not.
