// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProtocolRegistry.sol";
import "./SlippageGuard.sol";

contract ExecutionEngine is Ownable {
    ProtocolRegistry public registry;
    SlippageGuard public slippageGuard;
    uint256 public defaultMaxSlippageBps = 100; // 1% default

    event ExecutionSuccess(address indexed target, uint256 value, bytes data);
    event ExecutionFailure(address indexed target, uint256 value, bytes data, string reason);

    constructor(address _registry, address _slippageGuard) Ownable(msg.sender) {
        registry = ProtocolRegistry(_registry);
        slippageGuard = SlippageGuard(_slippageGuard);
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = ProtocolRegistry(_registry);
    }

    function setSlippageGuard(address _slippageGuard) external onlyOwner {
        slippageGuard = SlippageGuard(_slippageGuard);
    }

    function setDefaultMaxSlippageBps(uint256 _bps) external onlyOwner {
        defaultMaxSlippageBps = _bps;
    }

    function checkTx(
        address target,
        bytes calldata data,
        uint256 /* value */
    ) external view returns (bool) {
        registry.checkAddress(target);
        slippageGuard.verifySlippage(target, data, defaultMaxSlippageBps);
        return true;
    }

    function executeTx(
        address target,
        bytes calldata data,
        uint256 value
    ) external payable onlyOwner returns (bytes memory) {
        registry.checkAddress(target);
        slippageGuard.verifySlippage(target, data, defaultMaxSlippageBps);

        (bool success, bytes memory result) = target.call{value: value}(data);
        
        if (success) {
            emit ExecutionSuccess(target, value, data);
            return result;
        } else {
            if (result.length > 0) {
                assembly {
                    let resultData := add(result, 0x20)
                    let resultSize := mload(result)
                    revert(resultData, resultSize)
                }
            } else {
                revert("ExecutionEngine: transaction failed without reason");
            }
        }
    }
}
