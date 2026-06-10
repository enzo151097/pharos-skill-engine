const { ethers } = require("ethers");

class ExecutionEngineSDK {
    /**
     * @param {string} rpcUrl
     * @param {string} privateKey
     * @param {string} engineAddress
     */
    constructor(rpcUrl, privateKey, engineAddress) {
        if (!rpcUrl || !privateKey || !engineAddress) {
            throw new Error("Missing required arguments: rpcUrl, privateKey, engineAddress");
        }
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.engineAddress = engineAddress;

        const engineAbi = [
            "function checkTx(address target, bytes calldata data, uint256 value) external view returns (bool)",
            "function executeTx(address target, bytes calldata data, uint256 value) external payable returns (bytes memory)"
        ];
        this.engine = new ethers.Contract(engineAddress, engineAbi, this.wallet);
    }

    /**
     * Check if target address is safe (not an EOA, blacklist check)
     * @param {string} target
     * @returns {Promise<{isContract: boolean, isBlacklisted: boolean}>}
     */
    async checkTargetSafety(target) {
        const code = await this.provider.getCode(target);
        const isContract = code !== "0x";
        
        let isBlacklisted = false;
        try {
            await this.engine.checkTx(target, "0x", 0);
        } catch (err) {
            if (err.message.includes("blacklisted")) {
                isBlacklisted = true;
            }
        }

        return { isContract, isBlacklisted };
    }

    /**
     * Validate transaction via on-chain checkTx
     * @param {string} target
     * @param {string} data
     * @param {bigint} value
     * @returns {Promise<boolean>}
     */
    async validateOnChain(target, data = "0x", value = 0n) {
        try {
            await this.engine.checkTx(target, data, value);
            return true;
        } catch (err) {
            throw new Error(`On-chain validation failed: ${err.message}`);
        }
    }

    /**
     * Preview/Simulate transaction locally using static call
     * @param {string} target
     * @param {string} data
     * @param {bigint} value
     * @returns {Promise<boolean>}
     */
    async simulatePreview(target, data = "0x", value = 0n) {
        try {
            await this.provider.call({
                from: this.wallet.address,
                to: target,
                data: data,
                value: value
            });
            return true;
        } catch (err) {
            throw new Error(`TxPreview simulation failed: ${err.message}`);
        }
    }

    /**
     * Fetch optimized gas fee settings
     * @returns {Promise<{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint}>}
     */
    async getOptimizedGasFees() {
        const feeData = await this.provider.getFeeData();
        return {
            maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 12n / 10n : feeData.gasPrice * 12n / 10n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 12n / 10n : ethers.parseUnits("1.5", "gwei")
        };
    }

    /**
     * Run all checks and execute transaction safely
     * @param {string} target
     * @param {string} data
     * @param {string|bigint} value
     * @param {object} options
     * @returns {Promise<ethers.TransactionReceipt>}
     */
    async safeExecute(target, data = "0x", value = 0n, options = {}) {
        const val = typeof value === "string" ? ethers.parseEther(value) : BigInt(value);

        // 1. Target check
        const { isBlacklisted } = await this.checkTargetSafety(target);
        if (isBlacklisted) {
            throw new Error("Execution blocked: Target address is blacklisted!");
        }

        // 2. On-chain validation
        await this.validateOnChain(target, data, val);

        // 3. TxPreview simulation
        await this.simulatePreview(target, data, val);

        // 4. Gas fee optimization
        const gasFees = await this.getOptimizedGasFees();

        // 5. Estimate gas dynamically if not provided
        let gasLimit = options.gasLimit;
        if (!gasLimit) {
            try {
                const estimated = await this.engine.executeTx.estimateGas(target, data, val);
                gasLimit = estimated * 12n / 10n; // 20% safety factor
            } catch (err) {
                gasLimit = 300000n; // fallback
            }
        }

        // 6. Submit Transaction
        const tx = await this.engine.executeTx(target, data, val, {
            gasLimit,
            maxFeePerGas: gasFees.maxFeePerGas,
            maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
            ...options
        });

        return await tx.wait();
    }
}

module.exports = ExecutionEngineSDK;
