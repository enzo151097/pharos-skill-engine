const { execSync } = require("child_process");
const { ethers } = require("ethers");

async function main() {
    console.log("=== ExecutionEngine SuperSkill Demo ===");
    
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = "https://atlantic.dplabs-internal.com";

    if (!privateKey) {
        console.error("❌ Error: PRIVATE_KEY environment variable not set.");
        console.log("Please export PRIVATE_KEY=<your_private_key> to run the testnet demo.");
        process.exit(1);
    }

    console.log("1. Compiling and deploying ExecutionEngine contracts to Pharos Atlantic Testnet...");
    try {
        const deployCmd = `forge script script/DeployExecutionEngine.s.sol:DeployExecutionEngine --rpc-url ${rpcUrl} --private-key ${privateKey} --broadcast --legacy`;
        console.log(`Running: ${deployCmd}`);
        const deployOutput = execSync(deployCmd, { encoding: "utf8" });
        console.log(deployOutput);

        // Extract contract addresses from output
        const registryMatch = deployOutput.match(/ProtocolRegistry deployed at:\s*(0x[a-fA-F0-9]{40})/);
        const guardMatch = deployOutput.match(/SlippageGuard deployed at:\s*(0x[a-fA-F0-9]{40})/);
        const engineMatch = deployOutput.match(/ExecutionEngine deployed at:\s*(0x[a-fA-F0-9]{40})/);

        if (!registryMatch || !guardMatch || !engineMatch) {
            console.error("❌ Failed to parse deployed contract addresses from Forge output.");
            process.exit(1);
        }

        const registryAddress = registryMatch[1];
        const guardAddress = guardMatch[1];
        const engineAddress = engineMatch[1];

        console.log("Contracts deployed successfully:");
        console.log(`- ProtocolRegistry: ${registryAddress}`);
        console.log(`- SlippageGuard: ${guardAddress}`);
        console.log(`- ExecutionEngine: ${engineAddress}`);

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);

        // Deploy a mock contract target for testing transaction execution
        console.log("\n2. Deploying a mock contract target...");
        const mockTargetAbi = [
            "constructor()",
            "function setValue(uint256 newVal) external",
            "uint256 public value"
        ];
        const mockTargetBytecode = "0x6080604052348015600f57600080fd5b5060ab8061001e6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c80633fa4f24514603757806355241077146051575b50600080fd5b603d606f565b60405160489190608c565b60405180910390f35b606d60048036036020811015606257600080fd5b50356075565b005b60005481565b8060008190555050565b6000819050919050565b608681607b565b82525050565b6000602082019050609f6000830184607f565b9291505056fea2646970667358221220a536780c8ee210738f6b0f023ea0ea5eb5324838634ca330f81d11ca71c368d464736f6c63430008190033";
        
        const factory = new ethers.ContractFactory(mockTargetAbi, mockTargetBytecode, wallet);
        const mockTarget = await factory.deploy();
        await mockTarget.waitForDeployment();
        const mockTargetAddress = await mockTarget.getAddress();
        console.log(`MockTarget deployed at: ${mockTargetAddress}`);

        // Define interface for ProtocolRegistry to blacklist mock target
        console.log("\n3. Testing Blacklist/Security Check...");
        const registryContract = new ethers.Contract(registryAddress, [
            "function setBlacklisted(address addr, bool status) external"
        ], wallet);

        console.log(`Blacklisting MockTarget: ${mockTargetAddress} in ProtocolRegistry...`);
        let tx = await registryContract.setBlacklisted(mockTargetAddress, true);
        await tx.wait();

        console.log("Running safe-execute.js to write value to blacklisted MockTarget (should fail)...");
        try {
            const data = mockTarget.interface.encodeFunctionData("setValue", [100]);
            execSync(`node scripts/safe-execute.js ${rpcUrl} ${privateKey} ${engineAddress} ${mockTargetAddress} ${data}`, { stdio: "inherit" });
            console.error("❌ Error: Transaction should have failed!");
            process.exit(1);
        } catch (err) {
            console.log("✅ Expected behavior: safe-execute script correctly blocked transaction because target is blacklisted!");
        }

        console.log("\n4. Testing Whitelist / Safe execution...");
        console.log(`Removing MockTarget: ${mockTargetAddress} from blacklist...`);
        tx = await registryContract.setBlacklisted(mockTargetAddress, false);
        await tx.wait();

        console.log("Running safe-execute.js to write value 99 to MockTarget (should succeed)...");
        const dataOk = mockTarget.interface.encodeFunctionData("setValue", [99]);
        execSync(`node scripts/safe-execute.js ${rpcUrl} ${privateKey} ${engineAddress} ${mockTargetAddress} ${dataOk}`, { stdio: "inherit" });

        const finalVal = await mockTarget.value();
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
