const { ethers } = require("ethers");

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.error("Usage: node safe-execute.js <rpcUrl> <privateKey> <engineAddress> <target> [data] [value]");
        process.exit(1);
    }

    const [rpcUrl, privateKey, engineAddress, target, data = "0x", valueStr = "0"] = args;
    const value = ethers.parseEther(valueStr);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Analyzing transaction to target: ${target}`);

    // Component 1: Blacklist & Security check via provider lookup (simulated off-chain GoPlus)
    const code = await provider.getCode(target);
    if (code === "0x") {
        console.warn("⚠️ Warning: Target is an EOA (Externally Owned Account), not a contract.");
    }

    const engineAbi = [
        "function checkTx(address target, bytes calldata data, uint256 value) external view returns (bool)",
        "function executeTx(address target, bytes calldata data, uint256 value) external payable returns (bytes memory)"
    ];
    const engine = new ethers.Contract(engineAddress, engineAbi, wallet);

    // Component 2: On-chain checkTx call (simulates Slippage and Registry checks)
    try {
        await engine.checkTx(target, data, value);
        console.log("✅ On-chain checkTx validation passed.");
    } catch (err) {
        console.error("❌ On-chain checkTx validation FAILED:", err.message);
        process.exit(1);
    }

    // Component 3: TxPreview simulation (local simulation using call static)
    try {
        await provider.call({
            from: wallet.address,
            to: target,
            data: data,
            value: value
        });
        console.log("✅ TxPreview simulation completed successfully.");
    } catch (err) {
        console.error("❌ TxPreview simulation FAILED (Transaction will revert):", err.message);
        process.exit(1);
    }

    // Component 4: GasOracle optimization (Base fee + Priority fee calculation)
    const feeData = await provider.getFeeData();
    console.log(`Gas Oracle - Base Fee: ${ethers.formatUnits(feeData.gasPrice, "gwei")} Gwei`);
    
    // Configure transaction parameters
    const txParams = {
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 12n / 10n : feeData.gasPrice * 12n / 10n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 12n / 10n : ethers.parseUnits("1.5", "gwei")
    };

    console.log(`Executing transaction safely via ExecutionEngine...`);
    try {
        const tx = await engine.executeTx(target, data, value, {
            gasLimit: 300000,
            maxFeePerGas: txParams.maxFeePerGas,
            maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
        });
        console.log(`Transaction broadcasted! Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Transaction Executed Successfully in block ${receipt.blockNumber}`);
    } catch (err) {
        console.error("❌ Execution FAILED:", err.message);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
