// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
