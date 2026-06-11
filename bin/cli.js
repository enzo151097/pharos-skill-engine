#!/usr/bin/env node
require('dotenv').config({ path: ['.env.local', '.env'] });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { ExecutionEngineSDK } = require('../index');

function getSDKParams(argv) {
    const rpcUrl = argv.rpcUrl || process.env.RPC_URL || process.env.PHAROS_RPC_URL || process.env.PHAROS_ATLANTIC_RPC_URL;
    const privateKey = argv.privateKey || process.env.PRIVATE_KEY || process.env.PHAROS_DEPLOYER_PRIVATE_KEY;
    const engineAddress = argv.engineAddress || process.env.ENGINE_ADDRESS || process.env.EXECUTION_ENGINE_CORE_ADDRESS;

    if (!rpcUrl) {
        throw new Error("Missing RPC URL. Provide via --rpc-url or set PHAROS_ATLANTIC_RPC_URL environment variable.");
    }
    if (!privateKey) {
        throw new Error("Missing Private Key. Provide via --private-key or set PHAROS_DEPLOYER_PRIVATE_KEY environment variable.");
    }
    if (!engineAddress) {
        throw new Error("Missing Engine Address. Provide via --engine-address or set EXECUTION_ENGINE_CORE_ADDRESS environment variable.");
    }

    return { rpcUrl, privateKey, engineAddress };
}

yargs(hideBin(process.argv))
    .usage('Usage: $0 <command> [options]')
    .command(
        'safety-check <target>',
        'Check safety of a target address',
        (yargs) => {
            return yargs
                .positional('target', {
                    describe: 'The target contract address to check',
                    type: 'string'
                })
                .option('rpc-url', {
                    describe: 'Pharos RPC URL',
                    type: 'string'
                })
                .option('private-key', {
                    describe: 'Private key of deployer wallet',
                    type: 'string'
                })
                .option('engine-address', {
                    describe: 'ExecutionEngine core address',
                    type: 'string'
                });
        },
        async (argv) => {
            try {
                const { rpcUrl, privateKey, engineAddress } = getSDKParams(argv);
                const sdk = new ExecutionEngineSDK(rpcUrl, privateKey, engineAddress);
                console.log(`Checking safety for target: ${argv.target}`);
                const { isContract, isBlacklisted } = await sdk.checkTargetSafety(argv.target);
                console.log(`Is Contract: ${isContract}`);
                console.log(`Is Blacklisted: ${isBlacklisted}`);
            } catch (err) {
                console.error(`Error checking safety: ${err.message}`);
                process.exit(1);
            }
        }
    )
    .command(
        'safe-execute <target> [data] [value]',
        'Execute a transaction safely via Pharos ExecutionEngine SDK',
        (yargs) => {
            return yargs
                .positional('target', {
                    describe: 'The target contract address to execute transaction on',
                    type: 'string'
                })
                .positional('data', {
                    describe: 'Transaction input data (calldata hex)',
                    type: 'string',
                    default: '0x'
                })
                .positional('value', {
                    describe: 'Transaction value (in Ether)',
                    type: 'string',
                    default: '0'
                })
                .option('rpc-url', {
                    describe: 'Pharos RPC URL',
                    type: 'string'
                })
                .option('private-key', {
                    describe: 'Private key of deployer wallet',
                    type: 'string'
                })
                .option('engine-address', {
                    describe: 'ExecutionEngine core address',
                    type: 'string'
                })
                .option('gas-limit', {
                    describe: 'Gas limit for transaction',
                    type: 'string'
                });
        },
        async (argv) => {
            try {
                const { rpcUrl, privateKey, engineAddress } = getSDKParams(argv);
                const sdk = new ExecutionEngineSDK(rpcUrl, privateKey, engineAddress);
                
                console.log(`Executing transaction to target: ${argv.target}`);
                const options = {};
                if (argv.gasLimit) {
                    options.gasLimit = BigInt(argv.gasLimit);
                }

                const valueStr = String(argv.value || "0");
                const receipt = await sdk.safeExecute(argv.target, argv.data, valueStr, options);
                console.log(`Transaction executed successfully!`);
                console.log(`Transaction Hash: ${receipt.hash || receipt.transactionHash}`);
                console.log(`Block Number: ${receipt.blockNumber}`);
            } catch (err) {
                console.error(`Execution failed: ${err.message}`);
                process.exit(1);
            }
        }
    )
    .command(
        'mcp-start',
        'Start the MCP server',
        () => {},
        () => {
            const mcpServerPath = path.resolve(__dirname, 'mcp-server.js');
            if (fs.existsSync(mcpServerPath)) {
                console.log(`Starting MCP server from ${mcpServerPath}...`);
                const child = spawn('node', [mcpServerPath], { stdio: 'inherit' });
                child.on('close', (code) => {
                    process.exit(code || 0);
                });
            } else {
                console.warn("⚠️ Warning: MCP server (bin/mcp-server.js) is not implemented yet.");
            }
        }
    )
    .command(
        'init',
        'Initialize the Pharos project and compile contracts',
        () => {},
        () => {
            const initScriptPath = path.resolve(__dirname, '../scripts/init.js');
            if (fs.existsSync(initScriptPath)) {
                console.log(`Starting Pharos initialization...`);
                const child = spawn('node', [initScriptPath], { stdio: 'inherit' });
                child.on('close', (code) => {
                    process.exit(code || 0);
                });
            } else {
                console.error(`Error: Initialization script not found at ${initScriptPath}`);
                process.exit(1);
            }
        }
    )
    .demandCommand(1, 'Please specify a command.')
    .help()
    .argv;
