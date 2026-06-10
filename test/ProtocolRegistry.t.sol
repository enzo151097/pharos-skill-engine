// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ProtocolRegistry.sol";

contract ProtocolRegistryTest is Test {
    ProtocolRegistry public registry;
    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        registry = new ProtocolRegistry();
    }

    function testWhitelist() public {
        assertEq(registry.checkAddress(alice), false);
        registry.setVerified(alice, true);
        assertEq(registry.checkAddress(alice), true);
    }

    function testBlacklist() public {
        registry.setBlacklisted(bob, true);
        vm.expectRevert("Registry: Target address is blacklisted");
        registry.checkAddress(bob);
    }
}
