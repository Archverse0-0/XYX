// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Script} from "forge-std/Script.sol";
import {XYXEvidenceRegistry} from "../src/XYXEvidenceRegistry.sol";
import {XYXEvaluator} from "../src/XYXEvaluator.sol";

/// Deploys only the two custom P0 contracts. All addresses are explicit environment inputs.
contract Deploy is Script {
   function run() external returns (XYXEvidenceRegistry registry, XYXEvaluator evaluator) {
        require(block.chainid == 5042002, "WRONG_ARC_TESTNET_CHAIN");
        address admin=vm.envAddress("XYX_ADMIN");address witnessAttestor=vm.envAddress("XYX_WITNESS_ATTESTOR");address evaluatorAttestor=vm.envAddress("XYX_EVALUATOR_ATTESTOR");address pauser=vm.envAddress("XYX_PAUSER");
        require(witnessAttestor != address(0) && evaluatorAttestor != address(0) && witnessAttestor != evaluatorAttestor,"SEPARATE_ATTESTORS_REQUIRED");
        address commerce=vm.envAddress("ERC8183_ADDRESS");require(commerce != address(0) && commerce.code.length > 0, "INVALID_ERC8183_TARGET");uint64 age=uint64(vm.envUint("RECEIPT_MAX_AGE"));uint64 lifetime=uint64(vm.envUint("VERDICT_LIFETIME"));
        vm.startBroadcast();registry=new XYXEvidenceRegistry(admin,witnessAttestor,pauser,age);evaluator=new XYXEvaluator(admin,evaluatorAttestor,pauser,commerce,lifetime);vm.stopBroadcast();
        require(address(registry).code.length>0&&address(evaluator).code.length>0,"DEPLOYMENT_FAILED");
    }
}
