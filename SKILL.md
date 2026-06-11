---
name: ExecutionEngine
description: >
  ExecutionEngine SuperSkill is a transaction safety layer for AI agents on Pharos Network.
  It screens transaction targets against an on-chain Protocol Registry, verifies slippage tolerances,
  simulates transaction previews via local Anvil forks/calls to identify reverts before execution,
  and optimizes EIP-1559 gas fees to prevent stuck transactions.
  It includes a CLI tool (pharos-cli) for execution and testing, and exposes a Model Context Protocol (MCP)
  server with tools (check_target_safety, simulate_preview, safe_execute, get_gas_fees) for LLM agent integration.
version: 1.1.0
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

6. **CLI Command Utility**:
   - A command-line wrapper (`bin/cli.js`) allowing direct execution of safety checks, transaction execution, project initialization, and starting the MCP server.

7. **Model Context Protocol (MCP) Server**:
   - A standard-compliant MCP server (`bin/mcp-server.js`) exposing tools (`check_target_safety`, `simulate_preview`, `safe_execute`, and `get_gas_fees`) for direct LLM agent tool calling.

## Deploying to Testnet

Use Forge Script to deploy the core contracts to the Pharos Atlantic Testnet:

```bash
forge script script/DeployExecutionEngine.s.sol:DeployExecutionEngine \
  --rpc-url https://atlantic.dplabs-internal.com \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --legacy
```

## Running Safe Transactions & CLI Commands

Agents and developers can run transaction payloads safely using the CLI tool:

```bash
# Using Node.js directly
node bin/cli.js safe-execute <target> [data] [value] --rpc-url <rpcUrl> --private-key <privateKey> --engine-address <engineAddress>

# Or via npx
npx pharos-cli safe-execute <target> [data] [value]
```

Example:
```bash
npx pharos-cli safe-execute 0xTargetContract 0x38ed1739... 0 --rpc-url https://atlantic.dplabs-internal.com --private-key $PRIVATE_KEY --engine-address 0xEngineAddress
```

You can also run safety checks directly:
```bash
npx pharos-cli safety-check 0xTargetContract
```

Or initialize the project:
```bash
npx pharos-cli init
```

## SDK Integration

AI agents can directly instantiate and call the SDK in JavaScript:

```javascript
const { ExecutionEngineSDK } = require("pharos-execution-engine");
const sdk = new ExecutionEngineSDK(rpcUrl, privateKey, engineAddress);
const receipt = await sdk.safeExecute(targetAddress, calldata, value);
```

## Model Context Protocol (MCP) Integration

LLM agents can use the Pharos MCP server to check safety and execute transactions. Run the server using:

```bash
npx pharos-mcp
# or
node bin/mcp-server.js
# or via the CLI
npx pharos-cli mcp-start
```

Exposed MCP Tools:
- `check_target_safety`: Checks target address against whitelist/blacklist.
- `simulate_preview`: Simulates EVM execution locally to check for reverts.
- `safe_execute`: Performs all validation checks and executes on-chain.
- `get_gas_fees`: Computes optimal EIP-1559 fees.

## Testing

Run unit tests via Forge:
```bash
forge test -v
```
