// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockTarget {
    uint256 public value;

    function setValue(uint256 newVal) external {
        value = newVal;
    }
}
