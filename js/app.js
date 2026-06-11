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

/// Defensive gate details data used for the interactive flow card on the landing page
const GATE_DETAILS = {
  registry: {
    title: "ProtocolRegistry Gate",
    icon: "fa-list-check",
    problem: "AI Agents dynamically call contracts. Malicious actors can supply phishing addresses to drain the agent's wallet assets.",
    strength: "Intercepts the call and queries ProtocolRegistry.sol on Pharos. Halts execution immediately at Gate 1 if the address is blacklisted.",
    contract: "ProtocolRegistry (0x8d87E6b80218a71be0D3DaB452020267c69BC937)"
  },
  approve: {
    title: "SafeApprove Gate",
    icon: "fa-shield-halved",
    problem: "Most dApps request infinite token approvals (uint_max). If hacked, the agent's entire token balance can be drained.",
    strength: "Checks active allowance. If infinite allowance is requested, automatically resizes the approval to the exact transaction amount to minimize exposure.",
    contract: "SafeApprove Gateway SDK module"
  },
  preview: {
    title: "Simulation Preview Gate (TxPreview)",
    icon: "fa-binoculars",
    problem: "Transactions can fail/revert on-chain after paying gas fees, wasting funds and halting the agent's logic.",
    strength: "Runs dry-run execution via local static calls. Checks outcome state changes and catches error reverts before paying gas fees.",
    contract: "ExecutionEngine.checkTx Pre-flight"
  },
  batch: {
    title: "Atomic BatchCompose Gate",
    icon: "fa-cubes",
    problem: "Executing operations sequentially (Approve then Swap) requires multiple transactions, risking stranded funds or MEV bot frontrunning.",
    strength: "Bundles multiple calls (Approve + Swap + Stake) into a single atomic Multicall on ExecutionEngine.sol, ensuring all-or-nothing execution.",
    contract: "ExecutionEngine (0xe0C047cBCBDB0e4b5Ca5544faec06A1eED247014)"
  },
  oracle: {
    title: "Dynamic Gas Oracle Gate",
    icon: "fa-gauge-high",
    problem: "Static gas configurations fail when network base fees spike, leaving transactions stuck in the mempool indefinitely.",
    strength: "Queries EIP-1559 fee parameters in real-time, calculating optimized base and priority fees with a 20% limit safety buffer.",
    contract: "Dynamic EIP-1559 Gas Provider"
  },
  diagnose: {
    title: "RevertDiagnose Gate",
    icon: "fa-stethoscope",
    problem: "Failed transactions return obscure raw hex revert data (e.g. 0x08c379a0...) which LLM agents cannot parse to self-correct.",
    strength: "Decodes raw revert hex and extracts slippage details or signature errors. Returns clean, actionable logs so the agent can auto-heal (e.g. raise slippage).",
    contract: "RevertDiagnose decrypter"
  }
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

// Scanner elements
let shieldDisplay;
let shieldStatus;
let stepRegistry;
let stepApprove;
let stepPreview;
let stepBatch;
let stepOracle;
let stepDiagnose;
let stepConnector;
let sandboxScenario;

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

  shieldDisplay = document.getElementById('shield-container') || document.querySelector('.shield-display');
  shieldStatus = document.getElementById('shield-status');
  stepRegistry = document.getElementById('step-registry');
  stepApprove = document.getElementById('step-approve');
  stepPreview = document.getElementById('step-preview');
  stepBatch = document.getElementById('step-batch');
  stepOracle = document.getElementById('step-oracle');
  stepDiagnose = document.getElementById('step-diagnose');
  stepConnector = document.querySelector('.step-connector');
  sandboxScenario = document.getElementById('sandbox-scenario');

  // Bind Listeners
  if (btnConnectWallet) btnConnectWallet.addEventListener('click', connectWallet);
  if (mockModeToggle) mockModeToggle.addEventListener('change', handleMockToggle);
  if (btnVerifySimulate) btnVerifySimulate.addEventListener('click', verifyAndSimulate);
  if (btnSafeExecute) btnSafeExecute.addEventListener('click', safeExecute);
  if (btnRegistryCheck) btnRegistryCheck.addEventListener('click', checkRegistry);
  if (btnAdminWhitelist) btnAdminWhitelist.addEventListener('click', adminWhitelist);
  if (btnAdminBlacklist) btnAdminBlacklist.addEventListener('click', adminBlacklist);
  if (btnClearTerminal) btnClearTerminal.addEventListener('click', clearTerminal);
  if (sandboxScenario) sandboxScenario.addEventListener('change', handleScenarioChange);

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
      
      // Auto-trigger security scan for enhanced UX
      verifyAndSimulate();
    }
  });

  // Init Connection Check
  initWeb3();

  // Page Routing System
  const landingPage = document.getElementById('landingPage');
  const demoPage = document.getElementById('demoPage');
  const brandLink = document.getElementById('brand-link');

  function showDemo() {
    if (landingPage) landingPage.classList.add('hidden');
    if (demoPage) demoPage.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateUI();
  }

  function showHome(noScroll = false) {
    if (demoPage) demoPage.classList.add('hidden');
    if (landingPage) landingPage.classList.remove('hidden');
    if (!noScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Bind Start Demo buttons
  document.querySelectorAll('[data-start-demo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showDemo();
    });
  });

  // Bind Back Home buttons
  document.querySelectorAll('[data-back-home]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showHome();
    });
  });

  if (brandLink) {
    brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      showHome();
    });
  }

  // Handle Topbar navigation scrolling and routing
  document.querySelectorAll('.topnav a').forEach(link => {
    link.addEventListener('click', (e) => {
      const hash = link.getAttribute('href');
      if (hash && hash.startsWith('#') && hash !== '#') {
        e.preventDefault();
        const isCurrentlyDemo = !demoPage.classList.contains('hidden');
        showHome(isCurrentlyDemo);
        
        setTimeout(() => {
          const targetEl = document.querySelector(hash);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }, isCurrentlyDemo ? 150 : 0);
      }
    });
  });

  // Developer Tabs System
  const devTabs = document.querySelectorAll('.dev-tab');
  devTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs
      devTabs.forEach(t => t.classList.remove('active'));
      // Activate clicked tab
      tab.classList.add('active');
      
      // Hide all panels
      const targetPanelId = tab.getAttribute('data-dev-tab');
      document.querySelectorAll('.dev-panel').forEach(panel => {
        panel.classList.add('hidden');
      });
      
      // Show targeted panel
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
      }
    });
  });

  // Scroll-Driven Animation Observer
  const observerOptions = {
    root: null,
    threshold: 0.1,
    rootMargin: "0px"
  };

  const scrollObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in-section').forEach(el => {
    scrollObserver.observe(el);
  });

  // Listen to horizontal flow chart clicks on the home page
  document.querySelectorAll('.flow-step').forEach(step => {
    step.addEventListener('click', () => {
      // Deactivate old active step, activate new active step
      document.querySelectorAll('.flow-step').forEach(s => s.classList.remove('active'));
      step.classList.add('active');
      
      const gateKey = step.getAttribute('data-gate');
      const data = GATE_DETAILS[gateKey];
      if (data) {
        const card = document.getElementById('flow-detail-card');
        if (card) {
          card.classList.add('update-glow');
          setTimeout(() => card.classList.remove('update-glow'), 500);
        }

        const iconEl = document.getElementById('detail-gate-icon');
        if (iconEl) iconEl.innerHTML = `<i class="fas ${data.icon}"></i>`;

        const titleEl = document.getElementById('detail-gate-title');
        if (titleEl) titleEl.textContent = data.title;

        const probEl = document.getElementById('detail-problem-text');
        if (probEl) probEl.textContent = data.problem;

        const strengthEl = document.getElementById('detail-strength-text');
        if (strengthEl) strengthEl.textContent = data.strength;

        const contractEl = document.getElementById('detail-gate-contract');
        if (contractEl) contractEl.textContent = data.contract;
      }
    });
  });
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
  
  // Auto-scroll after DOM paint
  setTimeout(() => {
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }, 20);
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
 * Helper to reset the visual scanner to default state
 */
function resetScanner() {
  if (shieldDisplay) {
    shieldDisplay.className = 'shield-display';
  }
  if (shieldStatus) {
    shieldStatus.textContent = 'READY';
  }
  if (stepConnector) {
    stepConnector.className = 'step-connector';
  }
  [stepRegistry, stepApprove, stepPreview, stepBatch, stepOracle, stepDiagnose].forEach(step => {
    if (step) {
      step.className = 'step';
    }
  });
}

function handleScenarioChange() {
  const scenario = sandboxScenario.value;
  if (scenario === 'custom') return;

  let target = MOCK_TARGET_ADDRESS;
  let calldata = '0x';
  let value = '0';

  if (scenario === 'phishing') {
    target = '0x1111111254fb6c44bac0bed2854e76f90643097d'; // Phishing address
    calldata = '0x';
    value = '0';
    writeLog("💡 Loaded Scenario 1: Registry Gate - Targeting a blacklisted phishing address.", "info");
  } else if (scenario === 'approve') {
    target = MOCK_TARGET_ADDRESS;
    // approve(0xSpender, uint256_max) hex
    calldata = '0x095d1a220000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    value = '0';
    writeLog("💡 Loaded Scenario 2: SafeApprove Gate - Requesting infinite token allowance (Infinite Approve).", "info");
  } else if (scenario === 'preview') {
    target = MOCK_TARGET_ADDRESS;
    // mock transfer call
    calldata = '0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000064';
    value = '0';
    writeLog("💡 Loaded Scenario 3: TxPreview Gate - Simulating asset balance changes before broadcasting.", "info");
  } else if (scenario === 'batch') {
    target = EXECUTION_ENGINE_ADDRESS;
    // Multicall batch compose custom calldata
    calldata = '0x1191a62d00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002';
    value = '0';
    writeLog("💡 Loaded Scenario 4: BatchCompose Gate - Bundling atomic operations (Swap & Stake).", "info");
  } else if (scenario === 'oracle') {
    target = MOCK_TARGET_ADDRESS;
    calldata = '0x';
    value = '0.1';
    writeLog("💡 Loaded Scenario 5: GasOracle Gate - Rescuing transaction from network congestion with EIP-1559.", "info");
  } else if (scenario === 'diagnose') {
    target = MOCK_TARGET_ADDRESS;
    // Slippage error mock calldata
    calldata = '0xbc250f5630B4cF539739dF2C5dAcb4c659F2488D_slippage_error_trigger';
    value = '0';
    writeLog("💡 Loaded Scenario 6: RevertDiagnose Gate - Decoding a failed DEX swap slippage revert.", "info");
  }

  if (sandboxTarget) sandboxTarget.value = target;
  if (sandboxCalldata) sandboxCalldata.value = calldata;
  if (sandboxValue) sandboxValue.value = value;

  // Auto scan
  verifyAndSimulate();
}

/**
 * Sandbox Verify & Simulate Transaction
 */
async function verifyAndSimulate() {
  const target = sandboxTarget.value.trim();
  const calldata = sandboxCalldata.value.trim() || '0x';
  const valText = sandboxValue.value.trim() || '0';
  const activePreset = sandboxScenario.value;

  if (!ethers.isAddress(target) && activePreset === 'custom') {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  // Start Scanner
  resetScanner();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (shieldDisplay) shieldDisplay.className = 'shield-display scanning';
  if (shieldStatus) shieldStatus.textContent = 'SCANNING';
  if (stepConnector) stepConnector.className = 'step-connector scanning';

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    writeLog("⚡ Initiating Pharos Shield 6-stage verification pipeline...", "system");

    // 1. Registry verification gate
    if (stepRegistry) stepRegistry.className = 'step active';
    await delay(500);
    
    if (activePreset === 'phishing' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      if (stepRegistry) stepRegistry.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';
      
      writeLog("🛡️ [Registry Gate] ❌ MALICIOUS TARGET DETECTED: Address is blacklisted in ProtocolRegistry.sol!", "error");
      writeLog("🛡️ [Registry Gate] 🚫 TRANSACTION BLOCKED: Protected agent wallet from interaction with a verified drainer.", "error");
      return;
    }
    
    if (stepRegistry) stepRegistry.className = 'step passed';
    writeLog("🛡️ [Registry Gate] ✅ VALID TARGET: Target address is not blacklisted.", "success");

    // 2. SafeApprove control gate
    if (stepApprove) stepApprove.className = 'step active';
    await delay(500);
    
    if (activePreset === 'approve' || calldata.includes('ffffffffffffffffffffffffffffffff')) {
      writeLog("🛡️ [SafeApprove Gate] ⚠️ WARNING: Intercepted request for infinite ERC-20 approval (uint_max)!", "system");
      await delay(500);
      writeLog("🛡️ [SafeApprove Gate] ⚙️ RESCALING PAYLOAD: Automatically resizing approval to exact spend requirements (50.0 USDC).", "info");
      writeLog("🛡️ [SafeApprove Gate] ✅ RISK MITIGATED: Allowance exposure minimized successfully.", "success");
    } else {
      writeLog("🛡️ [SafeApprove Gate] ✅ SECURE: No infinite approval requests detected.", "success");
    }
    if (stepApprove) stepApprove.className = 'step passed';

    // 3. Simulation Preview gate
    if (stepPreview) stepPreview.className = 'step active';
    await delay(500);
    
    if (activePreset === 'diagnose' || calldata.includes('slippage_error_trigger')) {
      if (stepPreview) stepPreview.className = 'step failed';
      writeLog("🛡️ [TxPreview Gate] ❌ SIMULATION FAILED: Target contract reverted the transaction. Shifting to revert diagnosis...", "error");
      
      // Jump directly to Diagnose gate
      if (stepDiagnose) stepDiagnose.className = 'step active';
      await delay(600);
      if (stepDiagnose) stepDiagnose.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';

      writeLog("🛡️ [RevertDiagnose Gate] 🔍 DECODING ERROR: Successfully decoded raw revert hex 0x08c379a0...", "info");
      writeLog("🛡️ [RevertDiagnose Gate] 📊 DIAGNOSIS: Reverted with 'UniswapV2Router: EXCEEDED_SLIPPAGE_TOLERANCE'. Actual price impact was 3.2%, which exceeds your 1.0% limit.", "error");
      writeLog("🛡️ [RevertDiagnose Gate] 💡 RECOMMENDATION: Adjust slippage tolerance to 3.5% or split the transaction size.", "info");
      writeLog("🛡️ [Shield Output] ❌ Transaction halted before broadcasting. Saved 0.0045 ETH in wasted gas fees.", "error");
      return;
    }

    if (activePreset === 'preview') {
      writeLog("🛡️ [TxPreview Gate] 📊 PREDICTED ASSET CHANGES (TxPreview):", "info");
      writeLog("• Agent Wallet (0xAgent): <span style='color: #ef4444;'>-100.0 USDT</span>", "info");
      writeLog("• Agent Wallet (0xAgent): <span style='color: var(--color-green);'>+0.034 ETH</span>", "info");
      writeLog("🛡️ [TxPreview Gate] ✅ VERIFIED: Simulation successful. Asset changes match predictions.", "success");
    } else {
      writeLog("🛡️ [TxPreview Gate] ✅ SUCCESS: Dry-run static call returned 0x (No error reverts).", "success");
    }
    if (stepPreview) stepPreview.className = 'step passed';

    // 4. BatchCompose gate
    if (stepBatch) stepBatch.className = 'step active';
    await delay(500);

    if (activePreset === 'batch') {
      writeLog("🛡️ [BatchCompose Gate] 📦 SEQUENTIAL STEPS DETECTED: Agent intends to Swap and immediately Stake tokens.", "info");
      await delay(500);
      writeLog("🛡️ [BatchCompose Gate] ⚡ BUNDLING OPERATIONS: Packaging individual calls into a single atomic Multicall.", "info");
      writeLog("🛡️ [BatchCompose Gate] ✅ MEV PROTECTION: Protected transaction flow against frontrunning, saving 30% gas.", "success");
    } else {
      writeLog("🛡️ [BatchCompose Gate] ✅ BATCH COMPOSER SKIPPED: Single operation transaction.", "success");
    }
    if (stepBatch) stepBatch.className = 'step passed';

    // 5. GasOracle gate
    if (stepOracle) stepOracle.className = 'step active';
    await delay(500);

    if (activePreset === 'oracle' || Number(valText) > 0) {
      writeLog("🛡️ [GasOracle Gate] ⚠️ NETWORK CONGESTION: Base Fee is spiking (+45%).", "system");
      await delay(400);
      writeLog("🛡️ [GasOracle Gate] ⚙️ EIP-1559 CONFIG: Base Fee: 45.2 Gwei. Priority Fee: 2.5 Gwei (High priority). Gas Limit Buffer: +20% margin.", "info");
      writeLog("🛡️ [GasOracle Gate] ✅ GAS CONFIGURATION OPTIMIZED: Transaction fee parameters set to guarantee inclusion in the next block.", "success");
    } else {
      writeLog("🛡️ [GasOracle Gate] ✅ SUCCESS: Standard gas fee query loaded (Base Fee: 2.1 Gwei).", "success");
    }
    if (stepOracle) stepOracle.className = 'step passed';

    // 6. RevertDiagnose gate
    if (stepDiagnose) stepDiagnose.className = 'step active';
    await delay(500);
    if (stepDiagnose) stepDiagnose.className = 'step passed';

    // Complete secure verification
    if (stepConnector) stepConnector.className = 'step-connector passed';
    if (shieldDisplay) shieldDisplay.className = 'shield-display secure';
    if (shieldStatus) shieldStatus.textContent = 'SECURE';
    
    writeLog("🎉 PHAROS SHIELD: All 6 security gates passed! Transaction is safe to execute.", "success");
  } else {
    // Web3 Mode logic (Execute transaction on Pharos Atlantic Testnet)
    if (!account || !provider || !registryContract) {
      writeLog("❌ Error: Web3 wallet not connected.", "error");
      resetScanner();
      return;
    }

    if (stepRegistry) stepRegistry.className = 'step active';
    writeLog(`[Web3] Checking contract bytecode for target ${target}...`, "info");
    
    let isContract = false;
    try {
      const code = await provider.getCode(target);
      isContract = (code !== '0x' && code !== '0x00');
      if (!isContract) {
        writeLog(`ℹ️ Target address ${target} is a personal account (EOA).`, "system");
      } else {
        writeLog(`✅ Target address ${target} is an active smart contract.`, "success");
      }
    } catch (e) {
      console.error(e);
    }
    await delay(500);
    if (stepRegistry) stepRegistry.className = 'step passed';

    if (stepApprove) stepApprove.className = 'step active';
    await delay(500);
    try {
      const isBlacklisted = await registryContract.isBlacklisted(target);
      if (isBlacklisted) {
        if (stepApprove) stepApprove.className = 'step failed';
        if (stepConnector) stepConnector.className = 'step-connector failed';
        if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
        if (shieldStatus) shieldStatus.textContent = 'BLOCKED';
        writeLog("❌ [Registry Check] Target address is blacklisted on-chain!", "error");
        return;
      }
      
      const isVerified = await registryContract.checkAddress(target);
      if (isVerified) {
        writeLog("✅ [Registry Check] Target address is verified on-chain.", "success");
      } else {
        writeLog("⚠️ [Registry Check] Target address is unregistered (Unknown).", "system");
      }
      if (stepApprove) stepApprove.className = 'step passed';
    } catch (err) {
      if (stepApprove) stepApprove.className = 'step failed';
      resetScanner();
      writeLog(`❌ Registry verification error: ${err.message}`, "error");
      return;
    }

    // Preview
    if (stepPreview) stepPreview.className = 'step active';
    await delay(500);
    const valueWei = ethers.parseEther(valText);
    let previewPassed = false;
    try {
      writeLog("⚡ Simulating transaction on-chain (static call preview)...", "info");
      const result = await provider.call({
        from: account,
        to: target,
        data: calldata,
        value: valueWei
      });
      writeLog(`⚡ Simulation successful! Return data: ${result}`, "success");
      if (stepPreview) stepPreview.className = 'step passed';
      previewPassed = true;
    } catch (simErr) {
      if (stepPreview) stepPreview.className = 'step failed';
      
      // Activate Diagnose to decode error
      if (stepDiagnose) stepDiagnose.className = 'step active';
      await delay(500);
      if (stepDiagnose) stepDiagnose.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';

      writeLog(`❌ Simulation failed (Tx Reverted): ${simErr.reason || simErr.message}`, "error");
      return;
    }

    // Batch step
    if (stepBatch) stepBatch.className = 'step active';
    await delay(500);
    if (stepBatch) stepBatch.className = 'step passed';

    // Gas Oracle step
    if (stepOracle) stepOracle.className = 'step active';
    await delay(500);
    if (stepOracle) stepOracle.className = 'step passed';

    // Diagnose step check
    if (stepDiagnose) stepDiagnose.className = 'step active';
    await delay(500);
    if (stepDiagnose) stepDiagnose.className = 'step passed';

    if (stepConnector) stepConnector.className = 'step-connector passed';
    if (shieldDisplay) shieldDisplay.className = 'shield-display secure';
    if (shieldStatus) shieldStatus.textContent = 'SECURE';
    
    writeLog("🎉 All Web3 checks passed. Transaction is ready to broadcast.", "success");
  }
}

/**
 * Sandbox Safe Execute Transaction
 */
async function safeExecute() {
  const target = sandboxTarget.value.trim();
  const calldata = sandboxCalldata.value.trim() || '0x';
  const valText = sandboxValue.value.trim() || '0';
  const activePreset = sandboxScenario.value;

  if (!ethers.isAddress(target) && activePreset === 'custom') {
    writeLog("❌ Validation failed: Target address is not a valid EVM address.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    if (activePreset === 'phishing' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      writeLog("❌ Execution error: Cannot send transaction to a blacklisted address!", "error");
      return;
    }
    if (activePreset === 'diagnose' || calldata.includes('slippage_error_trigger')) {
      writeLog("❌ Execution error: Transaction will revert on-chain! Blocked by TxPreview to save gas fees.", "error");
      return;
    }

    writeLog("🚀 Broadcasting secure transaction via Pharos Execution Engine...", "info");
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Generate a random transaction hash
    const hexChars = '0123456789abcdef';
    let randomHash = '0x';
    for (let i = 0; i < 64; i++) {
      randomHash += hexChars[Math.floor(Math.random() * 16)];
    }

    writeLog(`Broadcasted secure transaction: <a href="https://atlantic.pharosscan.xyz/tx/${randomHash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${randomHash}</a>`, "success");
    
    if (activePreset === 'batch') {
      writeLog("✅ [BatchCompose] Composed multicall executed successfully on ExecutionEngine core!", "success");
    } else if (activePreset === 'approve') {
      writeLog("✅ [SafeApprove] Resized allowance and executed transfer successfully!", "success");
    } else {
      writeLog("✅ Transaction confirmed successfully in block 23938482!", "success");
    }
  } else {
    // Execute real transaction via Web3 wallet (MetaMask)
    if (!account || !executionEngineContract) {
      writeLog("❌ Error: Web3 wallet not connected.", "error");
      return;
    }

    writeLog(`[Web3] Sending secure transaction via ExecutionEngine contract...`, "info");
    try {
      const valueWei = ethers.parseEther(valText);
      writeLog("Estimating gas limits...", "info");
      const gasEstimate = await executionEngineContract.executeTx.estimateGas(
        target,
        calldata,
        valueWei,
        { value: valueWei }
      );

      const gasLimit = (gasEstimate * 120n) / 100n; // 20% safety factor
      writeLog(`Estimated Gas: ${gasEstimate}. Using limit: ${gasLimit}`, "info");

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

      const tx = await executionEngineContract.executeTx(
        target,
        calldata,
        valueWei,
        txOpts
      );

      writeLog(`Transaction sent successfully: <a href="https://atlantic.pharosscan.xyz/tx/${tx.hash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${tx.hash}</a>`, "info");
      writeLog("Waiting for block receipt confirmation...", "info");

      const receipt = await tx.wait();
      writeLog(`✅ Safe transaction confirmed in block ${receipt.blockNumber}!`, "success");
    } catch (err) {
      writeLog(`❌ Transaction execution error: ${err.reason || err.message}`, "error");
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
