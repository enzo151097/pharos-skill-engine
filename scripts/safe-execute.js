require('dotenv').config({ path: ['.env.local', '.env'] });
const { ExecutionEngineSDK } = require("../index");
const { ethers } = require("ethers");

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.error("Usage: node safe-execute.js <rpcUrl> <privateKey> <engineAddress> <target> [data] [value]");
        process.exit(1);
    }

    const [rpcUrl, privateKey, engineAddress, target, data = "0x", valueStr = "0"] = args;
    const value = ethers.parseEther(valueStr);

    console.log(`Analyzing transaction to target: ${target} using ExecutionEngineSDK...`);

    try {
        const sdk = new ExecutionEngineSDK(rpcUrl, privateKey, engineAddress);
        
        // 1. Target check
        const { isContract, isBlacklisted } = await sdk.checkTargetSafety(target);
        if (!isContract) {
            console.warn("⚠️ Warning: Target is an EOA (Externally Owned Account), not a contract.");
        }
        if (isBlacklisted) {
            console.error("❌ On-chain checkTx validation FAILED: Target address is blacklisted");
            process.exit(1);
        }
        console.log("✅ On-chain checkTx validation passed.");

        // 2. Simulation preview
        await sdk.simulatePreview(target, data, value);
        console.log("✅ TxPreview simulation completed successfully.");

        // 3. Gas oracle
        const gasFees = await sdk.getOptimizedGasFees();
        console.log(`Gas Oracle - Base Fee: ${ethers.formatUnits(gasFees.maxFeePerGas, "gwei")} Gwei`);

        // 4. Safe execute
        console.log(`Executing transaction safely via ExecutionEngine...`);
        const receipt = await sdk.safeExecute(target, data, value);
        console.log(`Transaction broadcasted! Hash: ${receipt.hash || receipt.transactionHash}`);
        console.log(`✅ Transaction Executed Successfully in block ${receipt.blockNumber}`);
    } catch (err) {
        console.error(`❌ Execution FAILED: ${err.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
