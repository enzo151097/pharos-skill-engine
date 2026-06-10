// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/ProtocolRegistry.sol";
import "../src/SlippageGuard.sol";
import "../src/ExecutionEngine.sol";

contract DeployExecutionEngine is Script {
    function run() external {
        vm.startBroadcast();

        ProtocolRegistry registry = new ProtocolRegistry();
        console.log("ProtocolRegistry deployed at:", address(registry));

        SlippageGuard guard = new SlippageGuard();
        console.log("SlippageGuard deployed at:", address(guard));

        ExecutionEngine engine = new ExecutionEngine(address(registry), address(guard));
        console.log("ExecutionEngine deployed at:", address(engine));

        vm.stopBroadcast();
    }
}
