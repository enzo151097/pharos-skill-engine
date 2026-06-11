#!/usr/bin/env node

// Load environment variables from .env.local and .env files
require('dotenv').config({ path: ['.env.local', '.env'] });

const { ethers } = require("ethers");
const { ExecutionEngineSDK } = require("../index");

// Retrieve configuration from env variables
const rpcUrl = process.env.PHAROS_RPC_URL || process.env.RPC_URL || process.env.PHAROS_ATLANTIC_RPC_URL;
const privateKey = process.env.PHAROS_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.PHAROS_DEPLOYER_PRIVATE_KEY;
const engineAddress = process.env.PHAROS_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS || process.env.EXECUTION_ENGINE_CORE_ADDRESS;

let sdk = null;
let initError = null;

try {
    if (!rpcUrl) {
        throw new Error("Missing RPC URL. Please set PHAROS_RPC_URL (or RPC_URL/PHAROS_ATLANTIC_RPC_URL) environment variable.");
    }
    if (!privateKey) {
        throw new Error("Missing Private Key. Please set PHAROS_PRIVATE_KEY (or PRIVATE_KEY/PHAROS_DEPLOYER_PRIVATE_KEY) environment variable.");
    }
    if (!engineAddress) {
        throw new Error("Missing Engine Address. Please set PHAROS_ENGINE_ADDRESS (or ENGINE_ADDRESS/EXECUTION_ENGINE_CORE_ADDRESS) environment variable.");
    }
    sdk = new ExecutionEngineSDK(rpcUrl, privateKey, engineAddress);
    console.error("Pharos SDK initialized successfully for MCP server.");
} catch (err) {
    initError = err.message;
    console.error(`Pharos SDK initialization warning/error: ${initError}`);
}

async function main() {
    // Dynamically import ESM-only MCP SDK modules
    const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { CallToolRequestSchema, ListToolsRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

    const server = new Server(
        {
            name: "pharos-mcp",
            version: "1.1.0"
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    // List tools request handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "check_target_safety",
                    description: "Checks if target EVM address is a contract and not blacklisted.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            target: {
                                type: "string",
                                description: "The EVM address of the target contract to verify safety for."
                            }
                        },
                        required: ["target"]
                    }
                },
                {
                    name: "simulate_preview",
                    description: "Simulates the transaction locally (static call) before broadcasting.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            target: {
                                type: "string",
                                description: "The EVM address of the target contract."
                            },
                            data: {
                                type: "string",
                                description: "Transaction input data (calldata hex format). Default is '0x'.",
                                default: "0x"
                            },
                            value: {
                                type: "string",
                                description: "Transaction value in Ether (e.g. '0.1'). Default is '0'.",
                                default: "0"
                            }
                        },
                        required: ["target"]
                    }
                },
                {
                    name: "safe_execute",
                    description: "Runs the full safeExecute from our SDK, checking safety, validating on-chain, simulating locally, optimizing gas, and executing.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            target: {
                                type: "string",
                                description: "The EVM address of the target contract."
                            },
                            data: {
                                type: "string",
                                description: "Transaction input data (calldata hex format). Default is '0x'.",
                                default: "0x"
                            },
                            value: {
                                type: "string",
                                description: "Transaction value in Ether (e.g. '0.1'). Default is '0'.",
                                default: "0"
                            },
                            options: {
                                type: "object",
                                description: "Additional execution options, like gasLimit.",
                                properties: {
                                    gasLimit: {
                                        type: "string",
                                        description: "Gas limit for the transaction as a string representation of an integer."
                                    }
                                }
                            }
                        },
                        required: ["target"]
                    }
                },
                {
                    name: "get_gas_fees",
                    description: "Fetches EIP-1559 base fee and priority fee optimizations from the Pharos network.",
                    inputSchema: {
                        type: "object",
                        properties: {}
                    }
                }
            ]
        };
    });

    // Call tool request handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (initError) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Pharos SDK is not configured: ${initError}`
                    }
                ],
                isError: true
            };
        }

        try {
            switch (name) {
                case "check_target_safety": {
                    const { target } = args;
                    if (!target) {
                        throw new Error("Missing parameter: target");
                    }
                    const result = await sdk.checkTargetSafety(target);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    };
                }
                case "simulate_preview": {
                    const { target, data = "0x", value = "0" } = args;
                    if (!target) {
                        throw new Error("Missing parameter: target");
                    }
                    // parse value from ether string to Wei BigInt (matching safeExecute format)
                    const val = typeof value === "string" ? ethers.parseEther(value) : BigInt(value || 0);
                    const result = await sdk.simulatePreview(target, data, val);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ success: result }, null, 2)
                            }
                        ]
                    };
                }
                case "safe_execute": {
                    const { target, data = "0x", value = "0", options = {} } = args;
                    if (!target) {
                        throw new Error("Missing parameter: target");
                    }
                    
                    // Convert gasLimit from string to bigint in options if present
                    const sdkOptions = { ...options };
                    if (sdkOptions.gasLimit) {
                        sdkOptions.gasLimit = BigInt(sdkOptions.gasLimit);
                    }

                    const val = typeof value === "string" ? ethers.parseEther(value) : BigInt(value || 0);
                    const receipt = await sdk.safeExecute(target, data, val, sdkOptions);
                    
                    // BigInt objects cannot be serialized directly to JSON, so we convert them to strings
                    const receiptData = JSON.parse(JSON.stringify(receipt, (key, value) => {
                        return typeof value === "bigint" ? value.toString() : value;
                    }));

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    success: true,
                                    transactionHash: receipt.hash || receipt.transactionHash,
                                    blockNumber: receipt.blockNumber,
                                    receipt: receiptData
                                }, null, 2)
                            }
                        ]
                    };
                }
                case "get_gas_fees": {
                    const fees = await sdk.getOptimizedGasFees();
                    // BigInt values must be serialized to string
                    const result = {
                        maxFeePerGas: fees.maxFeePerGas.toString(),
                        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
                        maxFeePerGasGwei: ethers.formatUnits(fees.maxFeePerGas, "gwei"),
                        maxPriorityFeePerGasGwei: ethers.formatUnits(fees.maxPriorityFeePerGas, "gwei")
                    };
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    };
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (err) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error calling tool ${name}: ${err.message}`
                    }
                ],
                isError: true
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pharos MCP server running on stdio.");
}

main().catch((err) => {
    console.error("Fatal error starting Pharos MCP server:", err);
    process.exit(1);
});
