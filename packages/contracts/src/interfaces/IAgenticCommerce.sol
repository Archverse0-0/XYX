// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Subset checked against Arc's ERC-8183 quickstart, 2026-09-07.
/// See docs/INTEGRATIONS.md. Deployment must additionally verify the selected onchain target.
interface IAgenticCommerce {
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;
}
