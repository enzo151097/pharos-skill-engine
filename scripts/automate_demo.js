const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting automated browser demo...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  
  // Navigate to local http-server
  await page.goto('http://127.0.0.1:8081');
  
  // Wait for the user to start screen recording
  console.log('Waiting 4 seconds for user to start screen recording...');
  await new Promise(r => setTimeout(r, 4000));

  // 1. Scroll down to Interactive Flow section
  console.log('Scrolling to Interactive Flow section...');
  await page.evaluate(() => {
    document.getElementById('interactive-flow').scrollIntoView({ behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 2000));

  // 2. Click the 6 flow steps one by one
  const gates = ['approve', 'preview', 'batch', 'oracle', 'diagnose', 'registry'];
  for (const gate of gates) {
    console.log(`Clicking on gate: ${gate}`);
    const selector = `.flow-step[data-gate="${gate}"]`;
    await page.waitForSelector(selector);
    await page.click(selector);
    await new Promise(r => setTimeout(r, 2500));
  }

  // 3. Scroll to Threat Landscape (Before vs After)
  console.log('Scrolling to Before vs After comparison...');
  await page.evaluate(() => {
    document.getElementById('why-shield').scrollIntoView({ behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 3500));

  // 4. Scroll to comparison and gates grid
  console.log('Scrolling to Core Execution Gates Grid...');
  await page.evaluate(() => {
    document.getElementById('solution').scrollIntoView({ behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 3500));

  // 5. Scroll to Developer Suite
  console.log('Scrolling to Developer Suite...');
  await page.evaluate(() => {
    document.getElementById('developer-center').scrollIntoView({ behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 3500));

  // 6. Scroll to Deployed Smart Contracts
  console.log('Scrolling to Deployed Smart Contracts...');
  await page.evaluate(() => {
    document.getElementById('deployed-contracts').scrollIntoView({ behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 3500));

  // 7. Scroll back to top
  console.log('Scrolling back to top...');
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await new Promise(r => setTimeout(r, 2000));

  // 6. Start Sandbox Demo
  console.log('Entering Sandbox Demo page...');
  const sandboxBtn = '[data-start-demo]';
  await page.waitForSelector(sandboxBtn);
  await page.click(sandboxBtn);
  await new Promise(r => setTimeout(r, 2000));

  // 7. Toggle Mock Mode (Click the visible slider instead of the hidden input)
  console.log('Activating Mock Mode...');
  const mockSlider = '.slider.round';
  await page.waitForSelector(mockSlider);
  await page.click(mockSlider);
  await new Promise(r => setTimeout(r, 2000));

  // Scroll so that the System Output Console is visible on screen alongside the sandbox input
  console.log('Scrolling to make Terminal visible...');
  await page.evaluate(() => {
    document.getElementById('card-terminal').scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
  await new Promise(r => setTimeout(r, 2000));

  // 8. Scenario 1: Phishing
  console.log('Running Scenario 1: Phishing...');
  await page.select('#sandbox-scenario', 'phishing');
  await new Promise(r => setTimeout(r, 6000)); // wait 6s for verification scan to complete

  // 9. Scenario 2: SafeApprove
  console.log('Running Scenario 2: SafeApprove...');
  await page.select('#sandbox-scenario', 'approve');
  await new Promise(r => setTimeout(r, 6000));

  // 10. Scenario 3: TxPreview
  console.log('Running Scenario 3: TxPreview...');
  await page.select('#sandbox-scenario', 'preview');
  await new Promise(r => setTimeout(r, 6000));

  // Click Safe Execute
  console.log('Clicking Safe Execute...');
  const executeBtn = '#btn-safe-execute';
  await page.click(executeBtn);
  await new Promise(r => setTimeout(r, 6000));

  // 11. Scenario 4: BatchCompose
  console.log('Running Scenario 4: BatchCompose...');
  await page.select('#sandbox-scenario', 'batch');
  await new Promise(r => setTimeout(r, 6000));

  // 12. Scenario 5: GasOracle
  console.log('Running Scenario 5: GasOracle...');
  await page.select('#sandbox-scenario', 'oracle');
  await new Promise(r => setTimeout(r, 6000));

  // 13. Scenario 6: RevertDiagnose
  console.log('Running Scenario 6: RevertDiagnose...');
  await page.select('#sandbox-scenario', 'diagnose');
  await new Promise(r => setTimeout(r, 8000));

  console.log('Automated demo completed. Leaving browser open for your recording.');
})();
