// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

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

interface IUniswapV2Router {
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

contract SlippageGuard {
    bytes4 constant SWAP_EXACT_TOKENS_FOR_TOKENS = 0x38ed1739;
    bytes4 constant SWAP_EXACT_ETH_FOR_TOKENS = 0x7ff36ab5;
    bytes4 constant SWAP_EXACT_TOKENS_FOR_ETH = 0x18cbafe5;

    function verifySlippage(
        address target,
        bytes calldata data,
        uint256 maxSlippageBps
    ) external view returns (bool) {
        if (data.length < 4) return true;
        bytes4 selector = bytes4(data[:4]);

        if (selector == SWAP_EXACT_TOKENS_FOR_TOKENS) {
            (uint256 amountIn, uint256 amountOutMin, address[] memory path, , ) = abi.decode(
                data[4:],
                (uint256, uint256, address[], address, uint256)
            );
            
            try IUniswapV2Router(target).getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
                uint256 expectedOut = amounts[amounts.length - 1];
                uint256 minAllowed = (expectedOut * (10000 - maxSlippageBps)) / 10000;
                require(amountOutMin >= minAllowed, "SlippageGuard: slippage too high");
            } catch {
                require(amountOutMin > 0, "SlippageGuard: amountOutMin cannot be zero");
            }
        } else if (selector == SWAP_EXACT_ETH_FOR_TOKENS) {
            (, uint256 amountOutMin, , , ) = abi.decode(
                data[4:],
                (uint256, uint256, address[], address, uint256)
            );
            require(amountOutMin > 0, "SlippageGuard: amountOutMin cannot be zero");
        } else if (selector == SWAP_EXACT_TOKENS_FOR_ETH) {
            (uint256 amountIn, uint256 amountOutMin, address[] memory path, , ) = abi.decode(
                data[4:],
                (uint256, uint256, address[], address, uint256)
            );
            try IUniswapV2Router(target).getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
                uint256 expectedOut = amounts[amounts.length - 1];
                uint256 minAllowed = (expectedOut * (10000 - maxSlippageBps)) / 10000;
                require(amountOutMin >= minAllowed, "SlippageGuard: slippage too high");
            } catch {
                require(amountOutMin > 0, "SlippageGuard: amountOutMin cannot be zero");
            }
        }
        
        return true;
    }
}

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
