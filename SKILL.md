---
name: ExecutionEngine
description: >
  ExecutionEngine SuperSkill is a transaction safety layer for AI agents on Pharos Network.
  It screens transaction targets against an on-chain Protocol Registry, verifies slippage tolerances,
  simulates transaction previews via local Anvil forks/calls to identify reverts before execution,
  and optimizes EIP-1559 gas fees to prevent stuck transactions.
version: 1.0.0
requires:
  anyBins:
  - forge
  - cast
  - node
---

# ExecutionEngine SuperSkill

A production-grade transaction execution engine designed to safeguard AI agents operating on the Pharos Network.

## Components & Features

1. **ProtocolRegistry (`src/ProtocolRegistry.sol`)**:
   - Manages whitelisted/verified protocol contracts on Pharos Network.
   - Restricts transactions directed at malicious addresses or non-compliant blacklisted targets.

2. **SlippageGuard (`src/SlippageGuard.sol`)**:
   - Decodes UniswapV2/V3 and standard Router calldata.
   - Automatically compares the agent's configured minimum output parameters (`amountOutMin`) against current pool reserves and oracle prices to ensure slippage tolerances are tight and protected against sandwich attacks.

3. **ExecutionEngine (`src/ExecutionEngine.sol`)**:
   - Acts as the central gateway contract that coordinates on-chain registry compliance and slippage checks before making low-level calls.
   - Safely reverts on-chain with detailed context propagation if any validations fail.

4. **Off-chain Transaction Preview (`TxPreview`)**:
   - Executes transactions locally against a simulated state (`eth_call`) or using an Anvil local fork node to detect reverts or unwanted side effects *before* broadcasting.

5. **Dynamic Gas Oracle**:
   - Dynamically inspects block fee histories (`eth_feeHistory` and `getFeeData`) to determine EIP-1559 base fee and priority fee values, preventing stuck txs.

## Deploying to Testnet

Use Forge Script to deploy the core contracts to the Pharos Atlantic Testnet:

```bash
forge script script/DeployExecutionEngine.s.sol:DeployExecutionEngine \
  --rpc-url https://atlantic.dplabs-internal.com \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --legacy
```

## Running Safe Giao Dịch (Safe Transaction Execution)

Agents can run transaction payloads safely using Node.js:

```bash
node scripts/safe-execute.js <rpcUrl> <privateKey> <engineAddress> <target> [data] [value]
```

Example:
```bash
node scripts/safe-execute.js https://atlantic.dplabs-internal.com $PRIVATE_KEY 0xEngineAddress 0xTargetContract 0x38ed1739... 0
```

## Testing

Run unit tests via Forge:
```bash
forge test -v
```
