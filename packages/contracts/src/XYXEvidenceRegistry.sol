// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Immutable deployment. Attestations establish witness provenance, not independent HTTP truth.
contract XYXEvidenceRegistry is AccessControl, Pausable, EIP712 {
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant RECEIPT_TYPEHASH = keccak256("ReceiptAttestation(bytes32 providerKey,bytes32 endpointKey,bytes32 specHash,address payer,uint128 amountPaid,bytes32 paymentHash,bytes32 requestHash,bytes32 responseHash,bytes32 evidenceHash,bytes32 evidenceURIHash,uint32 latencyMs,uint16 httpStatus,uint8 outcome,uint64 observedAt,uint64 nonce,address providerAgentRegistry,uint256 providerAgentId)");
    uint64 public immutable maxReceiptAge;
    mapping(bytes32 => bool) public anchored;
    mapping(address => mapping(uint64 => bool)) public usedNonces;

    struct ReceiptAttestation {
        bytes32 providerKey;
        bytes32 endpointKey;
        bytes32 specHash;
        address payer;
        uint128 amountPaid;
        bytes32 paymentHash;
        bytes32 requestHash;
        bytes32 responseHash;
        bytes32 evidenceHash;
        bytes32 evidenceURIHash;
        uint32 latencyMs;
        uint16 httpStatus;
        uint8 outcome;
        uint64 observedAt;
        uint64 nonce;
        address providerAgentRegistry;
        uint256 providerAgentId;
    }

    error InvalidConfiguration();
    error InvalidReceipt();
    error InvalidTimestamp();
    error InvalidURI();
    error ReceiptAlreadyAnchored();
    error NonceAlreadyUsed();

    event ReceiptAnchored(
        bytes32 indexed receiptHash, bytes32 indexed endpointKey, bytes32 indexed providerKey,
        address payer, uint128 amountPaid, bytes32 specHash, bytes32 paymentHash,
        bytes32 requestHash, bytes32 responseHash, bytes32 evidenceHash, bytes32 evidenceURIHash,
        uint32 latencyMs, uint16 httpStatus, uint8 outcome, uint64 observedAt,
        address providerAgentRegistry, uint256 providerAgentId, string evidenceURI
    );

    constructor(address admin, address attestor, address pauser, uint64 receiptAge)
        EIP712("XYX Evidence Registry", "1")
    {
        if (admin == address(0) || attestor == address(0) || pauser == address(0) || receiptAge == 0) {
            revert InvalidConfiguration();
        }
        maxReceiptAge = receiptAge;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, attestor);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function hashReceipt(ReceiptAttestation calldata receipt) public view returns (bytes32) {
        // All fields are static ABI types; encoding the struct is identical to encoding its fields.
        return _hashTypedDataV4(keccak256(abi.encode(RECEIPT_TYPEHASH, receipt)));
    }

    function anchorReceipt(ReceiptAttestation calldata r, string calldata uri, bytes calldata signature)
        external whenNotPaused returns (bytes32 digest)
    {
        digest = hashReceipt(r);
        address signer = ECDSA.recover(digest, signature);
        _checkRole(ATTESTOR_ROLE, signer);
        if (bytes(uri).length == 0 || bytes(uri).length > 2048 || keccak256(bytes(uri)) != r.evidenceURIHash) revert InvalidURI();
        if (anchored[digest]) revert ReceiptAlreadyAnchored();
        if (usedNonces[signer][r.nonce]) revert NonceAlreadyUsed();
        if (r.observedAt > block.timestamp || block.timestamp - r.observedAt > maxReceiptAge) revert InvalidTimestamp();
        if (r.providerKey == 0 || r.endpointKey == 0 || r.specHash == 0 || r.payer == address(0)
            || r.evidenceHash == 0 || r.requestHash == 0 || r.responseHash == 0 || r.paymentHash == 0
            || r.outcome > 8 || (r.httpStatus != 0 && (r.httpStatus < 100 || r.httpStatus > 599))
            || (r.providerAgentRegistry == address(0) && r.providerAgentId != 0)) revert InvalidReceipt();
        anchored[digest] = true;
        usedNonces[signer][r.nonce] = true;
        emit ReceiptAnchored(digest, r.endpointKey, r.providerKey, r.payer, r.amountPaid,
            r.specHash, r.paymentHash, r.requestHash, r.responseHash, r.evidenceHash, r.evidenceURIHash,
            r.latencyMs, r.httpStatus, r.outcome, r.observedAt, r.providerAgentRegistry, r.providerAgentId, uri);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
