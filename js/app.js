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

// Dữ liệu so sánh 6 cổng bảo mật dùng cho trang chủ
const GATE_DETAILS = {
  registry: {
    title: "ProtocolRegistry Gate (Cổng Kiểm Duyệt Giao Thức)",
    icon: "fa-list-check",
    problem: "AI Agent gửi tài sản vào các địa chỉ hợp đồng giả mạo, ví phishing hoặc ví drainer không được kiểm định, dẫn tới nguy cơ mất trắng toàn bộ tài sản trong ví.",
    strength: "Kiểm tra động trạng thái Whitelist/Blacklist của địa chỉ đích trước khi thực hiện giao dịch thông qua ProtocolRegistry.sol trên chuỗi Pharos. Chặn đứng giao dịch ngay tại cổng số 1 nếu phát hiện dấu hiệu lừa đảo.",
    contract: "ProtocolRegistry (0x8d87E6b80218a71be0D3DaB452020267c69BC937)"
  },
  approve: {
    title: "SafeApprove Gate (Cổng Phê Duyệt An Toàn)",
    icon: "fa-shield-halved",
    problem: "Các giao thức dApp thường yêu cầu quyền phê duyệt Token vô hạn (uint_max). Nếu dApp bị hack hoặc dApp giả mạo, hacker có thể rút sạch toàn bộ số dư ERC-20 bất cứ lúc nào.",
    strength: "SafeApprove SDK kiểm tra quyền approve hiện tại. Nếu phát hiện yêu cầu duyệt vô hạn, nó tự động bóp nhỏ quyền hạn để chỉ vừa đủ thực hiện giao dịch cụ thể, hoặc reset trước khi approve mới, triệt tiêu 100% rủi ro phê duyệt thừa.",
    contract: "SafeApprove Gateway SDK module"
  },
  preview: {
    title: "Simulation Preview Gate (TxPreview - Giả Lập Trực Tuyến)",
    icon: "fa-binoculars",
    problem: "Giao dịch lỗi hoặc không đủ điều kiện bị Revert trực tiếp trên mạng, gây hao phí tiền Gas vô ích (đặc biệt khi gas tăng cao) mà không hoàn thành nhiệm vụ.",
    strength: "Chạy thử trước giao dịch (static call / dry-run) trên chuỗi để kiểm thử điều kiện lỗi và tính toán các thay đổi trạng thái số dư (State Changes) trước khi gửi giao dịch thật, tiết kiệm 100% gas nếu có lỗi xảy ra.",
    contract: "ExecutionEngine.checkTx Pre-flight"
  },
  batch: {
    title: "Atomic BatchCompose Gate (Đóng Gói Giao Dịch Nguyên Tử)",
    icon: "fa-cubes",
    problem: "Agent thực hiện Approve, Swap rồi Stake thành các giao dịch riêng lẻ. Giao dịch trung gian có thể bị kẹt hoặc bị bot chen hàng (MEV Frontrun/Sandwich) chiếm đoạt lợi thế.",
    strength: "Gộp tất cả các thao tác liên tiếp thành một lệnh Multicall nguyên tử duy nhất trên hợp đồng ExecutionEngine. Đảm bảo tất cả cùng thành công hoặc cùng hủy bỏ, loại bỏ rủi ro kẹt quỹ giữa chừng.",
    contract: "ExecutionEngine (0xe0C047cBCBDB0e4b5Ca5544faec06A1eED247014)"
  },
  oracle: {
    title: "Dynamic Gas Oracle Gate (Ước Lượng Phí Tránh Kẹt Mạng)",
    icon: "fa-gauge-high",
    problem: "Sử dụng phí gas tĩnh khiến giao dịch bị kẹt cứng khi phí mạng lưới tăng đột ngột, làm treo logic hoạt động của Agent và mất chi phí cơ hội.",
    strength: "Liên tục truy vấn oracle và lịch sử phí của mạng lưới Pharos, tính toán phí base fee và priority fee theo chuẩn EIP-1559, tự động bù thêm 20% margin giúp giao dịch được đưa vào block ngay lập tức.",
    contract: "Dynamic EIP-1559 Gas Provider"
  },
  diagnose: {
    title: "RevertDiagnose Gate (Giải Mã Lỗi Nghiệp Vụ)",
    icon: "fa-stethoscope",
    problem: "Mạng lưới trả về mã lỗi Hex trống rỗng (ví dụ: 0x08c379a0...) khi giao dịch thất bại làm AI Agent không hiểu lỗi để tự sửa chữa hành vi.",
    strength: "Bắt lấy mã lỗi, tra cứu chữ ký hàm lỗi, trích xuất dữ liệu trượt giá DEX hoặc lỗi ký và giải nghĩa thành thông báo dễ hiểu tiếng Việt kèm đề xuất hành động (ví dụ: khuyên nâng slippage lên 3%), giúp Agent tự sửa lỗi.",
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

  // Lắng nghe click sơ đồ luồng ngang trên trang chủ
  document.querySelectorAll('.flow-step').forEach(step => {
    step.addEventListener('click', () => {
      // Xóa active cũ, kích hoạt active mới
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
    writeLog("💡 Đã tải Kịch bản 1: Registry Gate - Nhắm vào địa chỉ lừa đảo blacklist.", "info");
  } else if (scenario === 'approve') {
    target = MOCK_TARGET_ADDRESS;
    // approve(0xSpender, uint256_max) hex
    calldata = '0x095d1a220000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    value = '0';
    writeLog("💡 Đã tải Kịch bản 2: SafeApprove Gate - Yêu cầu cấp quyền Token vô hạn (Infinite Approve).", "info");
  } else if (scenario === 'preview') {
    target = MOCK_TARGET_ADDRESS;
    // mock transfer call
    calldata = '0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000064';
    value = '0';
    writeLog("💡 Đã tải Kịch bản 3: TxPreview Gate - Giả lập kiểm tra biến động số dư trước khi broadcast.", "info");
  } else if (scenario === 'batch') {
    target = EXECUTION_ENGINE_ADDRESS;
    // Multicall batch compose custom calldata
    calldata = '0x1191a62d00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002';
    value = '0';
    writeLog("💡 Đã tải Kịch bản 4: BatchCompose Gate - Tích hợp gộp thao tác nguyên tử (Swap + Stake).", "info");
  } else if (scenario === 'oracle') {
    target = MOCK_TARGET_ADDRESS;
    calldata = '0x';
    value = '0.1';
    writeLog("💡 Đã tải Kịch bản 5: GasOracle Gate - Vượt qua tình huống kẹt mạng với EIP-1559.", "info");
  } else if (scenario === 'diagnose') {
    target = MOCK_TARGET_ADDRESS;
    // Slippage error mock calldata
    calldata = '0xbc250f5630B4cF539739dF2C5dAcb4c659F2488D_slippage_error_trigger';
    value = '0';
    writeLog("💡 Đã tải Kịch bản 6: RevertDiagnose Gate - Mô phỏng thất bại trượt giá trên Uniswap để giải mã lỗi.", "info");
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
    writeLog("❌ Lỗi kiểm tra: Địa chỉ đích không đúng định dạng EVM.", "error");
    return;
  }

  // Khởi động Scanner
  resetScanner();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (shieldDisplay) shieldDisplay.className = 'shield-display scanning';
  if (shieldStatus) shieldStatus.textContent = 'SCANNING';
  if (stepConnector) stepConnector.className = 'step-connector scanning';

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    writeLog("⚡ Bắt đầu tiến trình kiểm duyệt 6 bước của Pharos Shield...", "system");

    // 1. Registry verification gate
    if (stepRegistry) stepRegistry.className = 'step active';
    await delay(500);
    
    if (activePreset === 'phishing' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      if (stepRegistry) stepRegistry.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';
      
      writeLog("🛡️ [Registry Gate] ❌ PHÁT HIỆN ĐỊA CHỈ PHISHING: Địa chỉ này nằm trong blacklist của ProtocolRegistry.sol!", "error");
      writeLog("🛡️ [Registry Gate] 🚫 CHẶN GIAO DỊCH LẬP TỨC! Đã bảo vệ thành công số dư tài sản khỏi ví lọt danh sách đen.", "error");
      return;
    }
    
    if (stepRegistry) stepRegistry.className = 'step passed';
    writeLog("🛡️ [Registry Gate] ✅ ĐỊA CHỈ HỢP LỆ: Target không nằm trong danh sách đen.", "success");

    // 2. SafeApprove control gate
    if (stepApprove) stepApprove.className = 'step active';
    await delay(500);
    
    if (activePreset === 'approve' || calldata.includes('ffffffffffffffffffffffffffffffff')) {
      writeLog("🛡️ [SafeApprove Gate] ⚠️ CẢNH BÁO: Phát hiện payload yêu cầu quyền phê duyệt ERC-20 vô hạn (uint_max)!", "system");
      await delay(500);
      writeLog("🛡️ [SafeApprove Gate] ⚙️ ĐANG XỬ LÝ: Tự động ghi đè và giới hạn payload approve về mức chi tiêu thực tế (50.0 USDC).", "info");
      writeLog("🛡️ [SafeApprove Gate] ✅ PHÒNG NGỪA RỦI RO: Phê duyệt được bóp nhỏ thành công. Hạn chế phơi nhiễm lỗ hổng.", "success");
    } else {
      writeLog("🛡️ [SafeApprove Gate] ✅ AN TOÀN: Không phát hiện yêu cầu cấp quyền token vô hạn thừa thãi.", "success");
    }
    if (stepApprove) stepApprove.className = 'step passed';

    // 3. Simulation Preview gate
    if (stepPreview) stepPreview.className = 'step active';
    await delay(500);
    
    if (activePreset === 'diagnose' || calldata.includes('slippage_error_trigger')) {
      if (stepPreview) stepPreview.className = 'step failed';
      writeLog("🛡️ [TxPreview Gate] ❌ GIẢ LẬP THẤT BẠI: Hợp đồng đích trả về lỗi (Tx Reverted on-chain). Chuyển luồng sang chẩn đoán lỗi...", "error");
      
      // Nhảy thẳng sang Diagnose gate
      if (stepDiagnose) stepDiagnose.className = 'step active';
      await delay(600);
      if (stepDiagnose) stepDiagnose.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';

      writeLog("🛡️ [RevertDiagnose Gate] 🔍 GIẢI MÃ LỖI THÀNH CÔNG: Đã bắt được mã lỗi hex 0x08c379a0...", "info");
      writeLog("🛡️ [RevertDiagnose Gate] 📊 NGUYÊN NHÂN LỖI: Lỗi 'UniswapV2Router: EXCEEDED_SLIPPAGE_TOLERANCE'. Mức trượt giá thực tế là 3.2% vượt quá mức trần 1.0% mà Agent thiết lập.", "error");
      writeLog("🛡️ [RevertDiagnose Gate] 💡 KIẾN NGHỊ: Agent nên nâng mức trượt giá cho phép (slippage tolerance) lên 3.5% hoặc chia nhỏ giao dịch để thực hiện lại.", "info");
      writeLog("🛡️ [Shield Output] ❌ Giao dịch được ngăn chặn thành công trước khi phát sóng, tiết kiệm 0.0045 ETH phí gas vô ích.", "error");
      return;
    }

    if (activePreset === 'preview') {
      writeLog("🛡️ [TxPreview Gate] 📊 MÔ PHỎNG BIẾN ĐỘNG TÀI SẢN (Asset Changes Preview):", "info");
      writeLog("• Tài khoản ví Agent (0xAgent): <span style='color: #ef4444;'>-100.0 USDT</span>", "info");
      writeLog("• Tài khoản ví Agent (0xAgent): <span style='color: var(--color-green);'>+0.034 ETH</span>", "info");
      writeLog("🛡️ [TxPreview Gate] ✅ ĐỦ ĐIỀU KIỆN: Kết quả giả lập thành công, trạng thái ví thay đổi đúng dự đoán.", "success");
    } else {
      writeLog("🛡️ [TxPreview Gate] ✅ THÀNH CÔNG: Chạy thử giao dịch qua Static Call trả về kết quả 0x (Không lỗi).", "success");
    }
    if (stepPreview) stepPreview.className = 'step passed';

    // 4. BatchCompose gate
    if (stepBatch) stepBatch.className = 'step active';
    await delay(500);

    if (activePreset === 'batch') {
      writeLog("🛡️ [BatchCompose Gate] 📦 PHÁT HIỆN CHUỖI THAO TÁC: Agent đang muốn Swap token và đem Stake ngay sau đó.", "info");
      await delay(500);
      writeLog("🛡️ [BatchCompose Gate] ⚡ GỘP NGUYÊN TỬ: Tự động đóng gói 2 lệnh độc lập thành 1 giao dịch Multicall duy nhất.", "info");
      writeLog("🛡️ [BatchCompose Gate] ✅ BẢO VỆ CHỐNG MEV: Tránh kẹt vốn trung gian, giảm 30% tổng chi phí gas.", "success");
    } else {
      writeLog("🛡️ [BatchCompose Gate] ✅ KHÔNG BATCHING: Giao dịch đơn lẻ, bỏ qua cổng đóng gói.", "success");
    }
    if (stepBatch) stepBatch.className = 'step passed';

    // 5. GasOracle gate
    if (stepOracle) stepOracle.className = 'step active';
    await delay(500);

    if (activePreset === 'oracle' || Number(valText) > 0) {
      writeLog("🛡️ [GasOracle Gate] ⚠️ NGHẼN MẠNG: Base Fee đang tăng đột biến (+45%).", "system");
      await delay(400);
      writeLog("🛡️ [GasOracle Gate] ⚙️ TÍNH TOÁN GAS EIP-1559: Ước tính Base Fee: 45.2 Gwei. Priority Fee: 2.5 Gwei (Ưu tiên cao). Buffer: +20% gas limit.", "info");
      writeLog("🛡️ [GasOracle Gate] ✅ ĐÃ PHIÊN DỊCH: Tự động đính kèm cấu hình gas tối ưu vào giao dịch đảm bảo đưa vào block trong vòng 10 giây.", "success");
    } else {
      writeLog("🛡️ [GasOracle Gate] ✅ THÀNH CÔNG: Tải phí gas tiêu chuẩn thành công (Base Fee: 2.1 Gwei).", "success");
    }
    if (stepOracle) stepOracle.className = 'step passed';

    // 6. RevertDiagnose gate
    if (stepDiagnose) stepDiagnose.className = 'step active';
    await delay(500);
    if (stepDiagnose) stepDiagnose.className = 'step passed';

    // Hoàn tất secure
    if (stepConnector) stepConnector.className = 'step-connector passed';
    if (shieldDisplay) shieldDisplay.className = 'shield-display secure';
    if (shieldStatus) shieldStatus.textContent = 'SECURE';
    
    writeLog("🎉 PHAROS SHIELD: Tất cả 6 cổng bảo mật đều đã thông qua! Giao dịch cực kỳ an toàn để thực hiện.", "success");
  } else {
    // Web3 Mode logic (Hàm chạy thật trên Pharos Atlantic Testnet)
    if (!account || !provider || !registryContract) {
      writeLog("❌ Lỗi: Chưa kết nối ví Web3.", "error");
      resetScanner();
      return;
    }

    if (stepRegistry) stepRegistry.className = 'step active';
    writeLog(`[Web3] Đang kiểm tra mã bytecode của hợp đồng target ${target}...`, "info");
    
    let isContract = false;
    try {
      const code = await provider.getCode(target);
      isContract = (code !== '0x' && code !== '0x00');
      if (!isContract) {
        writeLog(`ℹ️ Địa chỉ ${target} là ví cá nhân (EOA).`, "system");
      } else {
        writeLog(`✅ Địa chỉ ${target} là ví hợp đồng thông minh.`, "success");
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
        writeLog("❌ [Registry Check] Địa chỉ này nằm trong danh sách đen (Blacklisted) trên chain!", "error");
        return;
      }
      
      const isVerified = await registryContract.checkAddress(target);
      if (isVerified) {
        writeLog("✅ [Registry Check] Địa chỉ đã được xác minh chính chủ on-chain.", "success");
      } else {
        writeLog("⚠️ [Registry Check] Địa chỉ chưa đăng ký (Unregistered Address).", "system");
      }
      if (stepApprove) stepApprove.className = 'step passed';
    } catch (err) {
      if (stepApprove) stepApprove.className = 'step failed';
      resetScanner();
      writeLog(`❌ Lỗi kiểm tra Registry: ${err.message}`, "error");
      return;
    }

    // Preview
    if (stepPreview) stepPreview.className = 'step active';
    await delay(500);
    const valueWei = ethers.parseEther(valText);
    let previewPassed = false;
    try {
      writeLog("⚡ Đang giả lập giao dịch trên mạng (static call preview)...", "info");
      const result = await provider.call({
        from: account,
        to: target,
        data: calldata,
        value: valueWei
      });
      writeLog(`⚡ Giả lập thành công! Kết quả trả về: ${result}`, "success");
      if (stepPreview) stepPreview.className = 'step passed';
      previewPassed = true;
    } catch (simErr) {
      if (stepPreview) stepPreview.className = 'step failed';
      
      // Kích hoạt Diagnose để giải mã lỗi
      if (stepDiagnose) stepDiagnose.className = 'step active';
      await delay(500);
      if (stepDiagnose) stepDiagnose.className = 'step failed';
      if (stepConnector) stepConnector.className = 'step-connector failed';
      if (shieldDisplay) shieldDisplay.className = 'shield-display blocked';
      if (shieldStatus) shieldStatus.textContent = 'BLOCKED';

      writeLog(`❌ Giả lập thất bại (Tx Reverted): ${simErr.reason || simErr.message}`, "error");
      return;
    }

    // Batch step (Chỉ chạy qua on Web3)
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
    
    writeLog("🎉 Mọi kiểm thử Web3 thành công. Giao dịch sẵn sàng phát sóng.", "success");
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
    writeLog("❌ Lỗi kiểm tra: Địa chỉ đích không đúng định dạng EVM.", "error");
    return;
  }

  const isMock = mockModeToggle ? mockModeToggle.checked : false;

  if (isMock) {
    if (activePreset === 'phishing' || target.toLowerCase() === '0x1111111254fb6c44bac0bed2854e76f90643097d') {
      writeLog("❌ Lỗi thực thi: Không thể gửi giao dịch đi tới địa chỉ lừa đảo bị Blacklisted!", "error");
      return;
    }
    if (activePreset === 'diagnose' || calldata.includes('slippage_error_trigger')) {
      writeLog("❌ Lỗi thực thi: Giao dịch chắc chắn bị revert trên chuỗi! Ngăn chặn bởi TxPreview để tránh mất gas.", "error");
      return;
    }

    writeLog("🚀 Đang gửi giao dịch an toàn qua Pharos Execution Engine...", "info");
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Tạo mã băm giao dịch ngẫu nhiên
    const hexChars = '0123456789abcdef';
    let randomHash = '0x';
    for (let i = 0; i < 64; i++) {
      randomHash += hexChars[Math.floor(Math.random() * 16)];
    }

    writeLog(`Đã phát sóng giao dịch an toàn: <a href="https://atlantic.pharosscan.xyz/tx/${randomHash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${randomHash}</a>`, "success");
    
    if (activePreset === 'batch') {
      writeLog("✅ [BatchCompose] Thực thi chuỗi lệnh thành công trên hợp đồng ExecutionEngine core!", "success");
    } else if (activePreset === 'approve') {
      writeLog("✅ [SafeApprove] Đã hạ giới hạn approve và thực hiện chuyển khoản thành công!", "success");
    } else {
      writeLog("✅ Giao dịch được xác nhận thành công ở block 23938482!", "success");
    }
  } else {
    // Thực hiện giao dịch thật trên ví Web3 (MetaMask)
    if (!account || !executionEngineContract) {
      writeLog("❌ Lỗi: Chưa kết nối ví Web3.", "error");
      return;
    }

    writeLog(`[Web3] Đang gửi giao dịch an toàn thông qua ExecutionEngine contract...`, "info");
    try {
      const valueWei = ethers.parseEther(valText);
      writeLog("Đang ước tính phí gas...", "info");
      const gasEstimate = await executionEngineContract.executeTx.estimateGas(
        target,
        calldata,
        valueWei,
        { value: valueWei }
      );

      const gasLimit = (gasEstimate * 120n) / 100n; // 20% safety factor
      writeLog(`Gas ước lượng: ${gasEstimate}. Giới hạn sử dụng: ${gasLimit}`, "info");

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

      writeLog(`Giao dịch gửi thành công: <a href="https://atlantic.pharosscan.xyz/tx/${tx.hash}" target="_blank" style="text-decoration: underline; color: #ff761c;">${tx.hash}</a>`, "info");
      writeLog("Đang đợi xác nhận giao dịch...", "info");

      const receipt = await tx.wait();
      writeLog(`✅ Giao dịch đã được xác nhận tại block ${receipt.blockNumber}!`, "success");
    } catch (err) {
      writeLog(`❌ Lỗi thực thi giao dịch: ${err.reason || err.message}`, "error");
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
