/**
 * Pharos ExecutionEngine Shield - Frontend Application Logic
 * Implements Web3 / Mock Mode flow utilizing Ethers.js v6 syntax.
 */

// Contract Addresses
const PROTOCOL_REGISTRY_ADDRESS = '0x8d87E6b80218a71be0D3DaB452020267c69BC937';
const SLIPPAGE_GUARD_ADDRESS = '0x0b72Ed35d27a77a8C1CD32E0eDB7D7326A460243';
const EXECUTION_ENGINE_ADDRESS = '0xe0C047cBCBDB0e4b5Ca5544faec06A1eED247014';
const MOCK_TARGET_ADDRESS = '0x2c692A2291ad46D034bAbF4a5ACF287341B7797a';

// Human-readable Contract ABIs
const PROTOCOL_REGISTRY_ABI = [
  "function isVerified(address addr) view returns (bool)",
  "function isBlacklisted(address addr) view returns (bool)",
  "function checkAddress(address addr) view returns (bool)",
  "function owner() view returns (address)",
  "function setVerified(address addr, bool status) external",
  "function setBlacklisted(address addr, bool status) external"
];

const EXECUTION_ENGINE_ABI = [
  "function registry() view returns (address)",
  "function slippageGuard() view returns (address)",
  "function defaultMaxSlippageBps() view returns (uint256)",
  "function checkTx(address target, bytes calldata data, uint256 value) view returns (bool)",
  "function executeTx(address target, bytes calldata data, uint256 value) payable returns (bytes)",
  "function owner() view returns (address)"
];

// App Global State
let provider = null;
let signer = null;
let account = null;
let registryContract = null;
let executionEngineContract = null;
let registryOwner = null;

// Mock registry state for Mock Agent Mode
const mockRegistry = {
  "0x2c692a2291ad46d034babf4a5acf287341b7797a": "Verified",
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Verified",
  "0x1111111254fb6c44bac0bed2854e76f90643097d": "Blacklisted"
};

// DOM Elements Cache
let btnConnectWallet;
let mockModeToggle;
let walletStatusDot;
let walletAccount;
let sandboxTarget;
let sandboxCalldata;
let sandboxValue;
let btnVerifySimulate;
let btnSafeExecute;
let registrySearchAddress;
let btnRegistryCheck;
let btnAdminWhitelist;
let btnAdminBlacklist;
let terminalOutput;
let btnClearTerminal;

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM Elements
  btnConnectWallet = document.getElementById('btn-connect-wallet');
  mockModeToggle = document.getElementById('mock-mode-toggle');
  walletStatusDot = document.getElementById('wallet-status-dot');
  walletAccount = document.getElementById('wallet-account');
  
  sandboxTarget = document.getElementById('sandbox-target');
  sandboxCalldata = document.getElementById('sandbox-calldata');
  sandboxValue = document.getElementById('sandbox-value');
  btnVerifySimulate = document.getElementById('btn-verify-simulate');
  btnSafeExecute = document.getElementById('btn-safe-execute');
  
  registrySearchAddress = document.getElementById('registry-search-address');
  btnRegistryCheck = document.getElementById('btn-registry-check');
  btnAdminWhitelist = document.getElementById('btn-admin-whitelist');
  btnAdminBlacklist = document.getElementById('btn-admin-blacklist');
  
  terminalOutput = document.getElementById('terminal-output');
  btnClearTerminal = document.getElementById('btn-clear-terminal');

  // Bind Listeners
  if (btnConnectWallet) btnConnectWallet.addEventListener('click', connectWallet);
  if (mockModeToggle) mockModeToggle.addEventListener('change', handleMockToggle);
  if (btnVerifySimulate) btnVerifySimulate.addEventListener('click', verifyAndSimulate);
  if (btnSafeExecute) btnSafeExecute.addEventListener('click', safeExecute);
  if (btnRegistryCheck) btnRegistryCheck.addEventListener('click', checkRegistry);
  if (btnAdminWhitelist) btnAdminWhitelist.addEventListener('click', adminWhitelist);
  if (btnAdminBlacklist) btnAdminBlacklist.addEventListener('click', adminBlacklist);
  if (btnClearTerminal) btnClearTerminal.addEventListener('click', clearTerminal);

  // Quick-load buttons via event delegation
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('btn-load-sample')) {
      const btn = e.target;
      const name = btn.getAttribute('data-name');
      const address = btn.getAttribute('data-address');
      const calldata = btn.getAttribute('data-calldata') || '0x';
      const value = btn.getAttribute('data-value') || '0';

      if (sandboxTarget) sandboxTarget.value = address;
      if (sandboxCalldata) sandboxCalldata.value = calldata;
      if (sandboxValue) sandboxValue.value = value;

      writeLog(`Loaded sample ${name} into sandbox.`, 'info');
    }
  });

  // Init Connection Check
  initWeb3();
});

/**
 * Terminal Logger
 * Appends a log line with a timestamp and styled class into the console
 */
function writeLog(message, type = 'system') {
  if (!terminalOutput) return;
  const div = document.createElement('div');
  div.className = `terminal-line ${type}-msg`;
  
  // Format local timestamp
  const date = new Date();
  const timeStr = date.toTimeString().split(' ')[0];
  
  div.innerHTML = `[${timeStr}] ${message}`;
  terminalOutput.appendChild(div);
  
  // Auto-scroll
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/**
 * Clear Terminal Output
 */
function clearTerminal() {
  if (terminalOutput) {
    terminalOutput.innerHTML = '';
    writeLog("Pharos ExecutionEngine Shield Console cleared.", "system");
  }
}

/**
 * Sync UI with Mock vs Web3 status
 */
function updateUI() {
  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    // Mock Mode styling: Yellow status, mock indicator, all buttons enabled
    if (walletStatusDot) {
      walletStatusDot.className = 'status-dot connected';
      walletStatusDot.style.backgroundColor = '#eab308'; // HSL yellow
    }
    if (walletAccount) {
      walletAccount.textContent = 'Mock Agent mode active';
    }

    if (btnVerifySimulate) btnVerifySimulate.disabled = false;
    if (btnSafeExecute) btnSafeExecute.disabled = false;
    if (btnAdminWhitelist) btnAdminWhitelist.disabled = false;
    if (btnAdminBlacklist) btnAdminBlacklist.disabled = false;
  } else {
    // Web3 Mode styling: Revert inline color overrides
    if (walletStatusDot) {
      walletStatusDot.style.backgroundColor = '';
    }

    if (account) {
      if (walletStatusDot) walletStatusDot.className = 'status-dot connected';
      if (walletAccount) {
        walletAccount.textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
      }

      if (btnVerifySimulate) btnVerifySimulate.disabled = false;
      if (btnSafeExecute) btnSafeExecute.disabled = false;

      // Enable admin controls if account is the on-chain registry owner
      const isOwner = registryOwner && account && (registryOwner.toLowerCase() === account.toLowerCase());
      if (btnAdminWhitelist) btnAdminWhitelist.disabled = !isOwner;
      if (btnAdminBlacklist) btnAdminBlacklist.disabled = !isOwner;
    } else {
      if (walletStatusDot) walletStatusDot.className = 'status-dot disconnected';
      if (walletAccount) walletAccount.textContent = 'Disconnected';

      if (btnVerifySimulate) btnVerifySimulate.disabled = true;
      if (btnSafeExecute) btnSafeExecute.disabled = true;
      if (btnAdminWhitelist) btnAdminWhitelist.disabled = true;
      if (btnAdminBlacklist) btnAdminBlacklist.disabled = true;
    }
  }
}

/**
 * Handle Mock Mode Toggle change
 */
function handleMockToggle() {
  const isMock = mockModeToggle.checked;
  if (isMock) {
    writeLog("Mock Mode activated. Sandbox environment simulated locally.", "info");
  } else {
    writeLog("Mock Mode deactivated. Switching back to Web3 wallet context.", "info");
  }
  updateUI();
}

/**
 * Initialize Web3 Connection
 */
async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);
      
      if (accounts.length > 0) {
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        
        if (chainId === 688689) {
          account = accounts[0];
          signer = await provider.getSigner();
          registryContract = new ethers.Contract(PROTOCOL_REGISTRY_ADDRESS, PROTOCOL_REGISTRY_ABI, signer);
          executionEngineContract = new ethers.Contract(EXECUTION_ENGINE_ADDRESS, EXECUTION_ENGINE_ABI, signer);
          
          try {
            registryOwner = await registryContract.owner();
          } catch (e) {
            console.error("Failed to query registry owner", e);
          }
          
          writeLog(`Auto-connected wallet: ${account}`, "success");
        } else {
          writeLog("Wallet detected on incorrect network. Click 'Connect Wallet' to switch chain.", "info");
        }
      }
    } catch (err) {
      console.error("Web3 initialization failed", err);
    }
  }
  updateUI();
}

/**
 * Check and Switch Chain, add chain if missing
 */
async function checkAndSwitchNetwork() {
  if (!window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xa8219' }] // Hex of 688689
    });
    return true;
  } catch (switchError) {
    // Code 4902 means the chain is not registered in the wallet
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xa8219',
            chainName: 'Pharos Atlantic Testnet',
            nativeCurrency: {
              name: 'ETH',
              symbol: 'ETH',
              decimals: 18
            },
            rpcUrls: ['https://atlantic.dplabs-internal.com'],
            blockExplorerUrls: ['https://atlantic.pharosscan.xyz']
          }]
        });
        return true;
      } catch (addError) {
        writeLog(`Failed to register Pharos Atlantic Testnet: ${addError.message}`, 'error');
        return false;
      }
    }
    writeLog(`Failed to switch chain: ${switchError.message}`, 'error');
    return false;
  }
}

/**
 * Connect wallet handler
 */
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    writeLog("No Web3 wallet extension detected. Please install MetaMask.", "error");
    return;
  }

  writeLog("Connecting to wallet...", "info");
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts.length === 0) {
      writeLog("Wallet request rejected or no account shared.", "error");
      return;
    }

    const correctNetwork = await checkAndSwitchNetwork();
    if (correctNetwork) {
      account = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      
      registryContract = new ethers.Contract(PROTOCOL_REGISTRY_ADDRESS, PROTOCOL_REGISTRY_ABI, signer);
      executionEngineContract = new ethers.Contract(EXECUTION_ENGINE_ADDRESS, EXECUTION_ENGINE_ABI, signer);
      
      try {
        registryOwner = await registryContract.owner();
      } catch (e) {
        console.error("Failed to query registry owner", e);
      }
      
      writeLog(`Wallet connected: ${account}`, "success");
      writeLog("Switched to Pharos Atlantic Testnet (Chain ID: 688689)", "info");
    } else {
      writeLog("Chain switch canceled or failed.", "error");
    }
    updateUI();
  } catch (err) {
    writeLog(`Wallet connection error: ${err.message}`, "error");
  }
}

// Register Window Ethereum Events
if (window.ethereum) {
  window.ethereum.on('accountsChanged', async (accounts) => {
    writeLog("Wallet accounts changed.", "info");
    if (accounts.length === 0) {
      account = null;
      signer = null;
      registryContract = null;
      executionEngineContract = null;
      registryOwner = null;
    } else {
      account = accounts[0];
      await initWeb3();
    }
    updateUI();
  });

  window.ethereum.on('chainChanged', () => {
    writeLog("Chain changed. Reloading wallet state...", "info");
    window.location.reload();
  });
}

/**
 * Sandbox Verify & Simulate Transaction
 */
async function verifyAndSimulate() {
  const target = sandboxTarget.value.trim();
  const calldata = sandboxCalldata.value.trim() || '0x';
  const valText = sandboxValue.value.trim() || '0';

  if (!ethers.isAddress(target)) {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    writeLog(`[Mock] Verifying safety of target address ${target}...`, "info");
    
    // Check local mock blacklist
    const status = mockRegistry[target.toLowerCase()] || 'Unregistered';
    if (status === 'Blacklisted' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      writeLog("❌ Target safety check FAILED: Address is blacklisted!", "error");
      return;
    }

    writeLog(`🔍 Target safety check: PASSED (Address is not blacklisted)`, "success");
    if (status === 'Verified') {
      writeLog(`🔍 On-chain registry status: Verified (Safe)`, "success");
    } else {
      writeLog(`⚠️ On-chain registry status: Unregistered (Warning)`, "system");
    }

    writeLog("⚡ Mock simulation successful: Call to target returned 0x", "success");
    writeLog("Gas estimated at 120,000. Optimized Base Fee: 2.4 Gwei", "info");
  } else {
    // Web3 Mode
    if (!account || !provider || !registryContract) {
      writeLog("❌ Error: Wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3] Checking if target has code & checking registry...`, "info");
    try {
      // 1. Code check
      const code = await provider.getCode(target);
      if (code === '0x' || code === '0x00') {
        writeLog(`ℹ️ Target address ${target} has no deployed contract code (EOA).`, "system");
      } else {
        writeLog(`✅ Target address ${target} has active deployed contract code.`, "success");
      }

      // 2. Registry status check
      try {
        const isVerified = await registryContract.checkAddress(target);
        if (isVerified) {
          writeLog("✅ Registry check PASSED: Target is verified on-chain.", "success");
        } else {
          writeLog("⚠️ Registry warning: Target is unregistered.", "system");
        }
      } catch (err) {
        writeLog("❌ Target safety check FAILED: Address is blacklisted!", "error");
        return; // stop execution if registry check reverts
      }

      // 3. Static call simulation
      writeLog("⚡ Simulating transaction on-chain via static call...", "info");
      const valueWei = ethers.parseEther(valText);
      try {
        const result = await provider.call({
          from: account,
          to: target,
          data: calldata,
          value: valueWei
        });
        writeLog(`⚡ Simulation successful! Return data: ${result}`, "success");
        
        // Slippage & Execution pre-flight check if ExecutionEngine contract exists
        if (executionEngineContract) {
          try {
            writeLog("Running ExecutionEngine checkTx pre-flight check...", "info");
            const eePassed = await executionEngineContract.checkTx(target, calldata, valueWei);
            if (eePassed) {
              writeLog("🛡️ ExecutionEngine: Slippage & safety pre-flight check PASSED.", "success");
            }
          } catch (eeErr) {
            writeLog(`⚠️ ExecutionEngine checkTx failed: ${eeErr.reason || eeErr.message}`, "error");
          }
        }
      } catch (simErr) {
        writeLog(`❌ Simulation failed/reverted: ${simErr.reason || simErr.message}`, "error");
      }
    } catch (e) {
      writeLog(`❌ Simulation query failed: ${e.message}`, "error");
    }
  }
}

/**
 * Sandbox Safe Execute Transaction
 */
async function safeExecute() {
  const target = sandboxTarget.value.trim();
  const calldata = sandboxCalldata.value.trim() || '0x';
  const valText = sandboxValue.value.trim() || '0';

  if (!ethers.isAddress(target)) {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    const status = mockRegistry[target.toLowerCase()] || 'Unregistered';
    if (status === 'Blacklisted' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      writeLog("❌ Target safety check FAILED: Address is blacklisted!", "error");
      return;
    }

    writeLog("🚀 Simulating transaction broadcasting...", "info");
    
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate random tx hash
    const hexChars = '0123456789abcdef';
    let randomHash = '0x';
    for (let i = 0; i < 64; i++) {
      randomHash += hexChars[Math.floor(Math.random() * 16)];
    }

    writeLog(`Transaction broadcasted: <a href="https://atlantic.pharosscan.xyz/tx/${randomHash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${randomHash}</a>`, "success");
    writeLog("✅ Transaction confirmed in block 23938482!", "success");
  } else {
    // Web3 Mode
    if (!account || !executionEngineContract) {
      writeLog("❌ Error: Wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3] Initiating Safe Transaction Execution via ExecutionEngine...`, "info");
    try {
      const valueWei = ethers.parseEther(valText);

      // Gas Estimation
      writeLog("Estimating gas limits...", "info");
      const gasEstimate = await executionEngineContract.executeTx.estimateGas(
        target,
        calldata,
        valueWei,
        { value: valueWei }
      );

      const gasLimit = (gasEstimate * 120n) / 100n; // 20% safety factor
      writeLog(`Estimated Gas: ${gasEstimate}. Using limit: ${gasLimit}`, "info");

      // Gas price options
      const feeData = await provider.getFeeData();
      const txOpts = { 
        value: valueWei,
        gasLimit: gasLimit
      };

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        txOpts.maxFeePerGas = feeData.maxFeePerGas;
        txOpts.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else if (feeData.gasPrice) {
        txOpts.gasPrice = feeData.gasPrice;
      }

      writeLog("Sending transaction to ExecutionEngine...", "info");
      const tx = await executionEngineContract.executeTx(
        target,
        calldata,
        valueWei,
        txOpts
      );

      writeLog(`Transaction sent: <a href="https://atlantic.pharosscan.xyz/tx/${tx.hash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${tx.hash}</a>`, "info");
      writeLog("Waiting for block receipt confirmation...", "info");

      const receipt = await tx.wait();
      writeLog(`✅ Transaction confirmed in block ${receipt.blockNumber}!`, "success");
    } catch (err) {
      writeLog(`❌ Execution failed/reverted: ${err.reason || err.message}`, "error");
    }
  }
}

/**
 * Registry check handler
 */
async function checkRegistry() {
  const addr = registrySearchAddress.value.trim();
  if (!ethers.isAddress(addr)) {
    writeLog("❌ Validation failed: Search address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    const status = mockRegistry[addr.toLowerCase()] || 'Unregistered';
    if (status === 'Verified') {
      writeLog(`Registry status for ${addr}: Verified (Safe)`, "success");
    } else if (status === 'Blacklisted') {
      writeLog(`Registry status for ${addr}: Blacklisted (Malicious)`, "error");
    } else {
      writeLog(`Registry status for ${addr}: Unregistered (Unknown)`, "system");
    }
  } else {
    // Web3 Mode
    if (!registryContract) {
      writeLog("❌ Error: Wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3] Querying registry status for ${addr}...`, "info");
    try {
      const isVerified = await registryContract.isVerified(addr);
      const isBlacklisted = await registryContract.isBlacklisted(addr);

      if (isBlacklisted) {
        writeLog(`Registry status for ${addr}: Blacklisted (Malicious)`, "error");
      } else if (isVerified) {
        writeLog(`Registry status for ${addr}: Verified (Safe)`, "success");
      } else {
        writeLog(`Registry status for ${addr}: Unregistered (Unknown)`, "system");
      }
    } catch (err) {
      writeLog(`❌ Registry lookup error: ${err.message}`, "error");
    }
  }
}

/**
 * Admin Whitelist action
 */
async function adminWhitelist() {
  const addr = registrySearchAddress.value.trim();
  if (!ethers.isAddress(addr)) {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    mockRegistry[addr.toLowerCase()] = 'Verified';
    writeLog(`[Mock Admin] Successfully whitelisted/verified address ${addr}`, "success");
  } else {
    // Web3 Mode
    if (!registryContract) {
      writeLog("❌ Error: Wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3 Admin] Whitelisting address ${addr}...`, "info");
    try {
      const tx = await registryContract.setVerified(addr, true);
      writeLog(`Transaction sent: <a href="https://atlantic.pharosscan.xyz/tx/${tx.hash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${tx.hash}</a>`, "info");
      await tx.wait();
      writeLog(`✅ Whitelist status successfully updated for ${addr}.`, "success");
    } catch (err) {
      writeLog(`❌ Admin whitelisting failed: ${err.reason || err.message}`, "error");
    }
  }
}

/**
 * Admin Blacklist action
 */
async function adminBlacklist() {
  const addr = registrySearchAddress.value.trim();
  if (!ethers.isAddress(addr)) {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    mockRegistry[addr.toLowerCase()] = 'Blacklisted';
    writeLog(`[Mock Admin] Successfully blacklisted address ${addr}`, "success");
  } else {
    // Web3 Mode
    if (!registryContract) {
      writeLog("❌ Error: Wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3 Admin] Blacklisting address ${addr}...`, "info");
    try {
      const tx = await registryContract.setBlacklisted(addr, true);
      writeLog(`Transaction sent: <a href="https://atlantic.pharosscan.xyz/tx/${tx.hash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${tx.hash}</a>`, "info");
      await tx.wait();
      writeLog(`✅ Blacklist status successfully updated for ${addr}.`, "success");
    } catch (err) {
      writeLog(`❌ Admin blacklisting failed: ${err.reason || err.message}`, "error");
    }
  }
}
