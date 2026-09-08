// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {XYXEvidenceRegistry} from "../src/XYXEvidenceRegistry.sol";
import {XYXEvaluator} from "../src/XYXEvaluator.sol";
import {IAgenticCommerce} from "../src/interfaces/IAgenticCommerce.sol";

interface Vm {
    function addr(uint256) external returns(address);
    function sign(uint256,bytes32) external returns(uint8,bytes32,bytes32);
    function warp(uint256) external;
    function chainId(uint256) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function prank(address) external;
}

// Test-only fixture, expressly permitted by PRD section 104. Never used by the live path.
contract TestCommerce is IAgenticCommerce {
    address public evaluator;
    uint8 public status;
    bool public fail;
    bytes public callback;
    bool public reentrySucceeded;
    function configure(address e, bool f, bytes memory c) external { evaluator=e; fail=f; callback=c; }
    function submit(uint256, bytes32, bytes calldata) external {}
    function complete(uint256, bytes32, bytes calldata p) external { act(1,p); }
    function reject(uint256, bytes32, bytes calldata p) external { act(2,p); }
    function act(uint8 decision,bytes calldata p) private {
        require(msg.sender==evaluator,"wrong evaluator");
        require(!fail,"external failure");
        require(status==0,"terminal");
        require(p.length==0,"unexpected params");
        if(callback.length>0) (reentrySucceeded,) = evaluator.call(callback);
        status=decision;
    }
}

contract SecurityTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant KEY = 0x1234;
    XYXEvidenceRegistry internal registry;
    XYXEvaluator internal evaluator;
    TestCommerce internal commerce;
    string internal constant URI = "ipfs://test-only-evidence";

    function setUp() public {
        vm.warp(100000); vm.chainId(5042002);
        registry=new XYXEvidenceRegistry(address(this),vm.addr(KEY),address(this),1 days);
        commerce=new TestCommerce();
        evaluator=new XYXEvaluator(address(this),vm.addr(KEY),address(this),address(commerce),300);
        commerce.configure(address(evaluator),false,"");
    }
    function sign(bytes32 digest) internal returns(bytes memory) {
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(KEY,digest); return abi.encodePacked(r,s,v);
    }
    function receipt() internal view returns(XYXEvidenceRegistry.ReceiptAttestation memory r) {
        r.providerKey=keccak256("provider"); r.endpointKey=keccak256("endpoint"); r.specHash=keccak256("spec");
        r.payer=address(this);r.amountPaid=100;r.paymentHash=keccak256("payment");r.requestHash=keccak256("request");
        r.responseHash=keccak256("response");r.evidenceHash=keccak256("evidence");r.evidenceURIHash=keccak256(bytes(URI));
        r.latencyMs=100;r.httpStatus=200;r.observedAt=uint64(block.timestamp);r.nonce=1;
    }
    function verdict() internal view returns(XYXEvaluator.JobVerdict memory) {
        return XYXEvaluator.JobVerdict(1,keccak256("evidence"),keccak256("reason"),1,uint64(block.timestamp),uint64(block.timestamp+100),1);
    }
    function testValidReceiptAndReplay() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        bytes32 digest=registry.anchorReceipt(r,URI,s);require(registry.anchored(digest));
        vm.expectRevert(XYXEvidenceRegistry.ReceiptAlreadyAnchored.selector);registry.anchorReceipt(r,URI,s);
    }
    function testInvalidAttestor() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();
        (uint8 v,bytes32 a,bytes32 b)=vm.sign(42,registry.hashReceipt(r));
        vm.expectRevert();registry.anchorReceipt(r,URI,abi.encodePacked(a,b,v));
    }
    function testInvalidSignature() public { vm.expectRevert();registry.anchorReceipt(receipt(),URI,hex"1234"); }
    function testURIReplacement() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        vm.expectRevert(XYXEvidenceRegistry.InvalidURI.selector);registry.anchorReceipt(r,"ipfs://substituted",s);
    }
    function testChainDomain() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        vm.chainId(1);vm.expectRevert();registry.anchorReceipt(r,URI,s);
    }
    function testContractDomain() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        XYXEvidenceRegistry other=new XYXEvidenceRegistry(address(this),vm.addr(KEY),address(this),1 days);
        vm.expectRevert();other.anchorReceipt(r,URI,s);
    }
    function testPausedRegistry() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        registry.pause();vm.expectRevert();registry.anchorReceipt(r,URI,s);
        registry.unpause();registry.anchorReceipt(r,URI,s);
    }
    function testMappingPreserved() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();r.providerAgentRegistry=address(123);r.providerAgentId=987;
        bytes32 digest=registry.hashReceipt(r);registry.anchorReceipt(r,URI,sign(digest));require(registry.anchored(digest));
    }
    function testUnmappedIdentityCannotHaveId() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();r.providerAgentId=1;bytes memory s=sign(registry.hashReceipt(r));
        vm.expectRevert(XYXEvidenceRegistry.InvalidReceipt.selector);registry.anchorReceipt(r,URI,s);
    }
    function testTimestampBoundaries() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();r.observedAt=uint64(block.timestamp+1);bytes memory s=sign(registry.hashReceipt(r));
        vm.expectRevert(XYXEvidenceRegistry.InvalidTimestamp.selector);registry.anchorReceipt(r,URI,s);
        r.observedAt=uint64(block.timestamp-1 days-1);s=sign(registry.hashReceipt(r));
        vm.expectRevert(XYXEvidenceRegistry.InvalidTimestamp.selector);registry.anchorReceipt(r,URI,s);
        r.observedAt=uint64(block.timestamp-1 days);registry.anchorReceipt(r,URI,sign(registry.hashReceipt(r)));
    }
    function testNonceReuseDifferentReceipt() public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();registry.anchorReceipt(r,URI,sign(registry.hashReceipt(r)));
        r.amountPaid++;bytes memory s=sign(registry.hashReceipt(r));vm.expectRevert(XYXEvidenceRegistry.NonceAlreadyUsed.selector);registry.anchorReceipt(r,URI,s);
    }
    function testFuzzSignedFieldMutation(uint8 field,bytes32 value) public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();bytes memory s=sign(registry.hashReceipt(r));
        uint256 index=uint256(field)%17;
        // XOR one bit of any of the 17 static words; chosen value supplies entropy without a no-op.
        assembly { let ptr := add(r,mul(index,32)) mstore(ptr,xor(mload(ptr),or(value,1))) }
        vm.expectRevert();registry.anchorReceipt(r,URI,s);
    }
    function testFuzzValidFields(uint64 nonce,uint128 amount,uint32 latency,uint16 status,bytes32 provider,bytes32 endpoint) public {
        XYXEvidenceRegistry.ReceiptAttestation memory r=receipt();r.nonce=nonce;r.amountPaid=amount;r.latencyMs=latency;
        r.httpStatus=uint16(100+uint256(status)%500);r.providerKey=provider==0?bytes32(uint256(1)):provider;r.endpointKey=endpoint==0?bytes32(uint256(1)):endpoint;
        registry.anchorReceipt(r,URI,sign(registry.hashReceipt(r)));
    }
    function testComplete() public { XYXEvaluator.JobVerdict memory v=verdict();evaluator.resolveJob(v,sign(evaluator.hashVerdict(v)));require(commerce.status()==1); }
    function testReject() public { XYXEvaluator.JobVerdict memory v=verdict();v.decision=2;evaluator.resolveJob(v,sign(evaluator.hashVerdict(v)));require(commerce.status()==2); }
    function testExpiredVerdict() public {
        XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));vm.warp(v.expiresAt);
        vm.expectRevert(XYXEvaluator.InvalidTimestamp.selector);evaluator.resolveJob(v,s);
    }
    function testReplayVerdict() public {
        XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));evaluator.resolveJob(v,s);
        vm.expectRevert(XYXEvaluator.VerdictAlreadyConsumed.selector);evaluator.resolveJob(v,s);
    }
    function testWrongEvaluatorSigner() public {
        XYXEvaluator.JobVerdict memory v=verdict();(uint8 a,bytes32 b,bytes32 c)=vm.sign(42,evaluator.hashVerdict(v));
        vm.expectRevert();evaluator.resolveJob(v,abi.encodePacked(b,c,a));
    }
    function testWrongJobEvaluator() public {
        commerce.configure(address(42),false,"");XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));
        vm.expectRevert();evaluator.resolveJob(v,s);require(!evaluator.consumed(evaluator.hashVerdict(v)));
    }
    function testPausedEvaluator() public {
        XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));evaluator.pause();vm.expectRevert();evaluator.resolveJob(v,s);
    }
    function testExternalFailureRollback() public {
        commerce.configure(address(evaluator),true,"");XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));
        vm.expectRevert();evaluator.resolveJob(v,s);require(!evaluator.consumed(evaluator.hashVerdict(v)));require(!evaluator.usedNonces(vm.addr(KEY),v.nonce));
        commerce.configure(address(evaluator),false,"");evaluator.resolveJob(v,s);
    }
    function testReentrancyBlocked() public {
        XYXEvaluator.JobVerdict memory v=verdict();bytes memory s=sign(evaluator.hashVerdict(v));
        commerce.configure(address(evaluator),false,abi.encodeCall(evaluator.resolveJob,(v,s)));
        evaluator.resolveJob(v,s);require(!commerce.reentrySucceeded());require(commerce.status()==1);
    }
    function testFuzzUnsupportedDecision(uint8 decision) public {
        if(decision==1||decision==2)return;XYXEvaluator.JobVerdict memory v=verdict();v.decision=decision;bytes memory s=sign(evaluator.hashVerdict(v));
        vm.expectRevert(XYXEvaluator.InvalidVerdict.selector);evaluator.resolveJob(v,s);
    }
    function testUnauthorizedPauseAndRoles() public {
        vm.prank(address(42));vm.expectRevert();registry.pause();
        bytes32 role=evaluator.ATTESTOR_ROLE();
        vm.prank(address(42));vm.expectRevert();evaluator.grantRole(role,address(42));
    }
}
