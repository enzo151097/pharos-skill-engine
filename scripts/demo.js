require('dotenv').config({ path: ['.env.local', '.env'] });
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== ExecutionEngine SuperSkill Demo ===");
    
    const privateKey = process.env.PRIVATE_KEY || process.env.PHAROS_DEPLOYER_PRIVATE_KEY;
    const rpcUrl = "https://atlantic.dplabs-internal.com";

    if (!privateKey) {
        console.error("❌ Error: PRIVATE_KEY environment variable not set.");
        console.log("Please export PRIVATE_KEY=<your_private_key> to run the testnet demo.");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deployer address: ${wallet.address}`);
    const balanceBefore = await provider.getBalance(wallet.address);
    console.log(`Deployer balance: ${ethers.formatEther(balanceBefore)} PHRS`);

    console.log("\n1. Compiling Solidity contracts via forge...");
    try {
        execSync("source ~/.bashrc && forge build", { 
            shell: "C:\\Program Files\\Git\\bin\\bash.exe", 
            stdio: "inherit" 
        });
        console.log("✅ Compilation successful!");
    } catch (err) {
        console.error("❌ Compilation failed:", err.message);
        process.exit(1);
    }

    console.log("\n2. Deploying ExecutionEngine contracts via Ethers.js...");
    let registryAddress, guardAddress, engineAddress;
    try {
        if (process.env.EXECUTION_ENGINE_CORE_ADDRESS && 
            process.env.EXECUTION_ENGINE_REGISTRY_ADDRESS && 
            process.env.EXECUTION_ENGINE_SLIPPAGE_GUARD_ADDRESS) {
            
            registryAddress = process.env.EXECUTION_ENGINE_REGISTRY_ADDRESS;
            guardAddress = process.env.EXECUTION_ENGINE_SLIPPAGE_GUARD_ADDRESS;
            engineAddress = process.env.EXECUTION_ENGINE_CORE_ADDRESS;
            
            console.log("Reusing already deployed contracts from environment variables:");
            console.log(`- ProtocolRegistry: ${registryAddress}`);
            console.log(`- SlippageGuard: ${guardAddress}`);
            console.log(`- ExecutionEngine: ${engineAddress}`);
        } else {
            // Load Artifacts
            const registryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/ProtocolRegistry.sol/ProtocolRegistry.json"), "utf8"));
            const guardArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/SlippageGuard.sol/SlippageGuard.json"), "utf8"));
            const engineArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/ExecutionEngine.sol/ExecutionEngine.json"), "utf8"));

            // Deploy ProtocolRegistry
            console.log("Deploying ProtocolRegistry...");
            const registryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode.object, wallet);
            const registry = await registryFactory.deploy();
            await registry.waitForDeployment();
            registryAddress = await registry.getAddress();
            console.log(`✅ ProtocolRegistry deployed at: ${registryAddress}`);

            // Deploy SlippageGuard
            console.log("Deploying SlippageGuard...");
            const guardFactory = new ethers.ContractFactory(guardArtifact.abi, guardArtifact.bytecode.object, wallet);
            const guard = await guardFactory.deploy();
            await guard.waitForDeployment();
            guardAddress = await guard.getAddress();
            console.log(`✅ SlippageGuard deployed at: ${guardAddress}`);

            // Deploy ExecutionEngine
            console.log("Deploying ExecutionEngine...");
            const engineFactory = new ethers.ContractFactory(engineArtifact.abi, engineArtifact.bytecode.object, wallet);
            const engine = await engineFactory.deploy(registryAddress, guardAddress);
            await engine.waitForDeployment();
            engineAddress = await engine.getAddress();
            console.log(`✅ ExecutionEngine deployed at: ${engineAddress}`);
        }
    } catch (err) {
        console.error("❌ Contract deployment failed:", err.message);
        process.exit(1);
    }

    // Deploy a mock contract target for testing transaction execution
    console.log("\n3. Deploying a mock contract target...");
    let mockTargetAddress;
    try {
        if (process.env.EXECUTION_ENGINE_MOCK_TARGET_ADDRESS) {
            mockTargetAddress = process.env.EXECUTION_ENGINE_MOCK_TARGET_ADDRESS;
            console.log(`✅ Reusing MockTarget from environment: ${mockTargetAddress}`);
        } else {
            const mockTargetArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "../out/MockTarget.sol/MockTarget.json"), "utf8"));
            
            const factory = new ethers.ContractFactory(mockTargetArtifact.abi, mockTargetArtifact.bytecode.object, wallet);
            const mockTarget = await factory.deploy();
            await mockTarget.waitForDeployment();
            mockTargetAddress = await mockTarget.getAddress();
            console.log(`✅ MockTarget deployed at: ${mockTargetAddress}`);
        }
    } catch (err) {
        console.error("❌ MockTarget deployment failed:", err.message);
        process.exit(1);
    }

    // Define interface for ProtocolRegistry to blacklist mock target
    console.log("\n4. Testing Blacklist/Security Check...");
    try {
        const registryContract = new ethers.Contract(registryAddress, [
            "function setBlacklisted(address addr, bool status) external"
        ], wallet);

        console.log(`Blacklisting MockTarget: ${mockTargetAddress} in ProtocolRegistry...`);
        let tx = await registryContract.setBlacklisted(mockTargetAddress, true);
        await tx.wait();

        console.log("Running safe-execute.js to write value to blacklisted MockTarget (should fail)...");
        try {
            const mockTargetInterface = new ethers.Interface([
                "function setValue(uint256 newVal) external"
            ]);
            const data = mockTargetInterface.encodeFunctionData("setValue", [100]);
            
            // Execute safe-execute.js using child process
            execSync(`node scripts/safe-execute.js ${rpcUrl} ${privateKey} ${engineAddress} ${mockTargetAddress} ${data}`, { stdio: "inherit" });
            console.error("❌ Error: Transaction should have failed!");
            process.exit(1);
        } catch (err) {
            console.log("✅ Expected behavior: safe-execute script correctly blocked transaction because target is blacklisted!");
        }

        console.log("\n5. Testing Whitelist / Safe execution...");
        console.log(`Removing MockTarget: ${mockTargetAddress} from blacklist...`);
        tx = await registryContract.setBlacklisted(mockTargetAddress, false);
        await tx.wait();

        console.log("Running safe-execute.js to write value 99 to MockTarget (should succeed)...");
        const mockTargetInterface = new ethers.Interface([
            "function setValue(uint256 newVal) external"
        ]);
        const dataOk = mockTargetInterface.encodeFunctionData("setValue", [99]);
        execSync(`node scripts/safe-execute.js ${rpcUrl} ${privateKey} ${engineAddress} ${mockTargetAddress} ${dataOk}`, { stdio: "inherit" });

        const mockTargetContract = new ethers.Contract(mockTargetAddress, [
            "function value() public view returns (uint256)"
        ], provider);
        const finalVal = await mockTargetContract.value();
        console.log(`\nMockTarget value after execution: ${finalVal}`);
        if (finalVal === 99n) {
            console.log("✅ Demo completed successfully! ExecutionEngine works perfectly!");
        } else {
            console.error(`❌ MockTarget value mismatch: expected 99, got ${finalVal}`);
            process.exit(1);
        }

    } catch (err) {
        console.error("❌ Demo execution failed:", err.message);
        process.exit(1);
    }
}

main();
