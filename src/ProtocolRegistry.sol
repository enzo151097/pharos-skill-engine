// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ProtocolRegistry is Ownable {
    mapping(address => bool) public isVerified;
    mapping(address => bool) public isBlacklisted;

    event AddressVerified(address indexed addr, bool status);
    event AddressBlacklisted(address indexed addr, bool status);

    constructor() Ownable(msg.sender) {}

    function setVerified(address addr, bool status) external onlyOwner {
        isVerified[addr] = status;
        emit AddressVerified(addr, status);
    }

    function setBlacklisted(address addr, bool status) external onlyOwner {
        isBlacklisted[addr] = status;
        emit AddressBlacklisted(addr, status);
    }

    function checkAddress(address addr) external view returns (bool) {
        require(!isBlacklisted[addr], "Registry: Target address is blacklisted");
        return isVerified[addr];
    }
}
