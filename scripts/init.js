const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

async function main() {
    console.log("=== ExecutionEngine Skill Initializer ===");

    // 1. Check if forge and cast are installed
    console.log("\n1. Checking prerequisites...");
    const homeDir = os.homedir();
    const foundryBin = path.join(homeDir, '.foundry', 'bin');
    
    // Add foundryBin to path for current process
    process.env.PATH = `${foundryBin}${path.delimiter}${process.env.PATH || ""}`;
    process.env.Path = `${foundryBin}${path.delimiter}${process.env.Path || ""}`;

    try {
        const forgeVer = execSync("forge --version", { encoding: "utf8" });
        console.log(`✅ Forge detected: ${forgeVer.trim()}`);
        const castVer = execSync("cast --version", { encoding: "utf8" });
        console.log(`✅ Cast detected: ${castVer.trim()}`);
    } catch (err) {
        console.warn("⚠️ Warning: Forge/Cast was not detected in standard paths.");
        console.log("Please ensure Foundry is installed. Run this command to install it:");
        console.log("  curl -L https://foundry.paradigm.xyz | bash && foundryup");
    }

    // 2. Setup .env.local
    console.log("\n2. Configuring environment variables...");
    const envLocalPath = path.join(__dirname, "../.env.local");
    const envExamplePath = path.join(__dirname, "../.env.example");

    if (!fs.existsSync(envLocalPath)) {
        try {
            fs.copyFileSync(envExamplePath, envLocalPath);
            console.log("✅ Created .env.local from .env.example");
            console.log("👉 Action Required: Open .env.local and configure your PHAROS_DEPLOYER_PRIVATE_KEY!");
        } catch (err) {
            console.error("❌ Failed to create .env.local:", err.message);
        }
    } else {
        console.log("✅ .env.local already exists, skipping copy.");
    }

    // 3. Compile contracts
    console.log("\n3. Compiling Solidity contracts...");
    try {
        // Try executing using git bash if on windows, otherwise standard exec
        if (process.platform === "win32") {
            try {
                execSync("source ~/.bashrc && forge build", { 
                    shell: "C:\\Program Files\\Git\\bin\bash.exe", 
                    stdio: "inherit" 
                });
            } catch (err) {
                execSync("forge build", { stdio: "inherit" });
            }
        } else {
            execSync("forge build", { stdio: "inherit" });
        }
        console.log("✅ Smart contracts compiled successfully! Artifacts saved to out/");
    } catch (err) {
        console.error("❌ Contract compilation failed. Make sure Foundry is installed and running.");
    }

    console.log("\n=== Initialization Complete ===");
    console.log("To deploy and run the testnet verification demo:");
    console.log("  node scripts/demo.js");
}

main().catch(err => {
    console.error("Initialization failed:", err);
    process.exit(1);
});
