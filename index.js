let isRunning = false;
let ui;
const seenItems = new Set();
let overlay;

function setupUI() {
  if (document.getElementById('infinibot-ui')) {
    document.getElementById('infinibot-ui').remove();
  }
  if (document.getElementById('infinibot-overlay')) {
    document.getElementById('infinibot-overlay').remove();
  }

  // Create overlay
  overlay = document.createElement('div');
  overlay.id = 'infinibot-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: '999998', display: 'none',
    pointerEvents: 'none' // allow clicks to pass through if needed, but visually cover
  });
  document.body.appendChild(overlay);

  const container = document.createElement('div');
  container.id = 'infinibot-ui';
  Object.assign(container.style, {
    position: 'fixed', top: '20px', left: '20px', zIndex: '999999',
    width: '360px', backgroundColor: '#fff', border: '1px solid #ccc',
    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: '10px', fontFamily: 'sans-serif', fontSize: '12px',
    color: '#333'
  });

  const headerRow = document.createElement('div');
  Object.assign(headerRow.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'
  });

  const title = document.createElement('h3');
  title.innerText = 'InfiniBot';
  title.style.margin = '0';
  
  const btn = document.createElement('button');
  btn.innerHTML = '🤖 ▶️ Play';
  Object.assign(btn.style, {
    padding: '4px 12px', cursor: 'pointer',
    borderRadius: '4px', border: '1px solid #ccc', background: '#f9f9f9',
    fontWeight: 'bold', fontSize: '13px'
  });
  
  btn.onclick = () => {
    isRunning = !isRunning;
    btn.innerHTML = isRunning ? '🤖 ⏸️ Pause' : '🤖 ▶️ Play';
    btn.style.background = isRunning ? '#e6ffe6' : '#f9f9f9';
    overlay.style.display = isRunning ? 'block' : 'none';
  };

  headerRow.appendChild(title);
  headerRow.appendChild(btn);

  const createLogBox = (titleText) => {
    const wrap = document.createElement('div');
    const label = document.createElement('strong');
    label.innerText = titleText;
    label.style.display = 'block';
    label.style.fontSize = '12px';
    label.style.marginTop = '8px';
    label.style.marginBottom = '2px';
    
    const logArea = document.createElement('div');
    Object.assign(logArea.style, {
      height: '60px', overflowY: 'auto', background: '#f4f4f4',
      border: '1px inset #ddd', fontSize: '11px', padding: '4px',
      display: 'flex', flexDirection: 'column'
    });
    
    wrap.appendChild(label);
    wrap.appendChild(logArea);
    return { wrap, logArea, label };
  };

  const generalLog = createLogBox('📜 General Log');
  const itemsLog = createLogBox('🆕 New Items This Session (0)');
  const discLog = createLogBox('✨ All First Discoveries (0)');

  const totalLabel = document.createElement('div');
  totalLabel.style.marginTop = '10px';
  totalLabel.style.fontWeight = 'bold';
  totalLabel.style.fontSize = '12px';
  totalLabel.innerText = 'Total Items Found: 0';

  container.appendChild(headerRow);
  container.appendChild(generalLog.wrap);
  container.appendChild(itemsLog.wrap);
  container.appendChild(discLog.wrap);
  container.appendChild(totalLabel);

  document.body.appendChild(container);

  const addLog = (area, msg, color = '#333') => {
    const el = document.createElement('div');
    el.innerText = msg;
    el.style.borderBottom = '1px solid #eee';
    el.style.padding = '2px 0';
    el.style.color = color;
    area.prepend(el);
    return el;
  };

  return { 
    log: (msg, color) => addLog(generalLog.logArea, msg, color),
    logItem: (msg) => addLog(itemsLog.logArea, msg),
    logDiscovery: (msg) => addLog(discLog.logArea, msg),
    updateCounts: (sessionNew, totalDisc, totalItems) => {
      itemsLog.label.innerText = `🆕 New Items This Session (${sessionNew})`;
      discLog.label.innerText = `✨ All First Discoveries (${totalDisc})`;
      totalLabel.innerText = `Total Items Found: ${totalItems}`;
    }
  };
}

infiniteCraftBot();
async function infiniteCraftBot() {
  ui = setupUI();

  // Initial prompt
  ui.log('Click ▶️ above to begin');

  let sessionNewCount = 0;
  let totalDiscoveryCount = 0;

  const refreshStats = () => {
    ui.updateCounts(sessionNewCount, totalDiscoveryCount, seenItems.size);
  };

  const wait = async (ms) => {
    let logEl = null;
    if (ms > 500) {
      logEl = ui.log(`Waiting ${ms}ms...`, '#999'); // lighter color for wait text
    }
    await new Promise((res) => setTimeout(res, ms));
    if (logEl) {
      logEl.remove(); // clear wait text when done
    }
  };

  const checkPause = async () => {
    while (!isRunning) await new Promise(r => setTimeout(r, 500));
  };

  function getRandomWait() {
    const r = Math.random();
    if (r < 0.70) return Math.floor(Math.random() * 50) + 50;         // 70% 50-100ms
    if (r < 0.95) return Math.floor(Math.random() * 100) + 100;       // 25% 100-200ms
    if (r < 0.995) return Math.floor(Math.random() * 800) + 200;      // 4.5% 200-1000ms
    return Math.floor(Math.random() * 2000) + 1000;                   // 0.5% 1000-3000ms
  }

  const checkForNewItems = () => {
    document.querySelectorAll(".item").forEach(el => {
      const emoji = el.querySelector('.item-emoji')?.textContent || el.dataset.itemEmoji || '';
      // Ensure we extract the pure text
      let text = el.dataset.itemText;
      if (!text) {
          text = el.textContent.replace(emoji, '').replace('First Discovery', '').trim();
      }
      
      if (text && !seenItems.has(text)) {
        seenItems.add(text);
        sessionNewCount++;
        ui.logItem(`${emoji} ${text}`);
        
        if (el.innerHTML.includes('First Discovery') || el.classList.contains('item-discovery')) {
           totalDiscoveryCount++;
           ui.logDiscovery(`${emoji} ${text}`);
        }
        refreshStats();
      }
    });
  };

  // Seed initial items so we don't log the starting elements as "New"
  document.querySelectorAll(".item").forEach(el => {
    const emoji = el.querySelector('.item-emoji')?.textContent || el.dataset.itemEmoji || '';
    let text = el.dataset.itemText;
    if (!text) {
        text = el.textContent.replace(emoji, '').replace('First Discovery', '').trim();
    }
    if (text && !seenItems.has(text)) {
      seenItems.add(text);
      // Pre-populate discoveries
      if (el.innerHTML.includes('First Discovery') || el.classList.contains('item-discovery')) {
        totalDiscoveryCount++;
        ui.logDiscovery(`${emoji} ${text}`);
      }
    }
  });
  
  refreshStats();

  while (true) {
    await checkPause();
    checkForNewItems();

    // Phase 1: Click random items (2 to 500 times)
    const numClicks = Math.floor(Math.random() * 499) + 2;
    ui.log(`[Phase 1] Clicking ${numClicks} items...`);
    for (let i = 0; i < numClicks; i++) {
      await checkPause();
      const buttons = document.querySelectorAll(".item");
      if (buttons.length === 0) break;
      
      const randomIndex = Math.floor(Math.random() * buttons.length);
      const button = buttons[randomIndex];
      simulateClick(button);
      await wait(getRandomWait());
    }

    await checkPause();
    checkForNewItems();

    // Phase 2: Drag instances on the board together
    const dragMultiplier = 0.4 + Math.random() * 0.1; // Random between 0.4 and 0.5
    const dragCount = Math.floor(numClicks * dragMultiplier);
    ui.log(`[Phase 2] Dragging ${dragCount} items...`);
    for (let i = 0; i < dragCount; i++) {
      await checkPause();
      const instances = document.querySelectorAll(".instance");
      if (instances.length < 2) {
        ui.log("Not enough items to combine. Waiting...", "#999");
        await wait(1000);
        break;
      }

      const idx1 = Math.floor(Math.random() * instances.length);
      let idx2 = Math.floor(Math.random() * instances.length);
      
      while (idx1 === idx2 && instances.length > 1) {
        idx2 = Math.floor(Math.random() * instances.length);
      }

      const el1 = instances[idx1];
      const el2 = instances[idx2];

      const emoji1 = el1.querySelector('.instance-emoji')?.textContent || el1.dataset.itemEmoji || '';
      const text1 = (el1.querySelector('.instance-text')?.textContent || el1.textContent).replace(emoji1, '').trim();
      const emoji2 = el2.querySelector('.instance-emoji')?.textContent || el2.dataset.itemEmoji || '';
      const text2 = (el2.querySelector('.instance-text')?.textContent || el2.textContent).replace(emoji2, '').trim();
      
      ui.log(`Dragged ${emoji1}${text1} onto ${emoji2}${text2}`);

      await simulateDragAndDrop(el1, el2);
      await wait(getRandomWait());
    }

    // Phase 3: Clear screen (1 in 2 chance)
    if (Math.random() < 0.5) {
      await checkPause();
      ui.log("Clearing canvas...");
      const clearIcon = document.querySelector('.clear.tool-icon') || document.querySelector('[data-tooltip="Clear Canvas"]');
      if (clearIcon) {
        simulateClick(clearIcon, false); // no log
        await wait(200);
        const yesBtn = document.querySelector('.action-btn.action-danger');
        if (yesBtn) {
          simulateClick(yesBtn, false); // no log
          await wait(500); 
        }
      }
    }
  }
}

async function simulateClick(element, log = true) {
  const rect = element.getBoundingClientRect();
  const coords = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true, cancelable: true, view: window,
  };
  element.dispatchEvent(new MouseEvent("mousedown", coords));
  element.dispatchEvent(new MouseEvent("mouseup", coords));
  element.dispatchEvent(new MouseEvent("click", coords));
  
  if (log) {
    const emoji = element.querySelector('.item-emoji')?.textContent || element.dataset.itemEmoji || '';
    let text = element.dataset.itemText;
    if (!text) {
        text = element.textContent.replace(emoji, '').replace('First Discovery', '').trim();
    }
    ui.log(`Clicked ${emoji}${text}`);
  }
}

async function simulateDragAndDrop(element1, element2) {
  const rect1 = element1.getBoundingClientRect();
  const rect2 = element2.getBoundingClientRect();

  const from = {
    clientX: rect1.left + rect1.width / 2,
    clientY: rect1.top + rect1.height / 2,
  };

  const to = {
    clientX: rect2.left + rect2.width / 2,
    clientY: rect2.top + rect2.height / 2,
  };

  const options = { bubbles: true, cancelable: true, view: window };

  element1.dispatchEvent(new MouseEvent("mousedown", { ...options, ...from, which: 1, buttons: 1 }));
  element1.dispatchEvent(new DragEvent("dragstart", { ...options, ...from }));
  element2.dispatchEvent(new MouseEvent("mousemove", { ...options, ...to, which: 1, buttons: 1 }));
  element2.dispatchEvent(new DragEvent("dragover", { ...options, ...to }));
  element2.dispatchEvent(new MouseEvent("mouseup", { ...options, ...to }));
  element2.dispatchEvent(new DragEvent("drop", { ...options, ...to }));
  element1.dispatchEvent(new DragEvent("dragend", { ...options, ...to }));
}

/**
 * A "brute-force" clicker that tries multiple strategies to trigger an element.
 * @param {string} selector - The CSS selector of the target element.
 */
async function bruteForceClick(selector) {
  const element = document.querySelector(selector);

  console.log(element);

  if (!element) {
    console.error(`[Error] Element "${selector}" not found.`);
    return;
  }

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  const rect = element.getBoundingClientRect();
  const coords = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
    cancelable: true,
    view: window,
  };

  console.log(`%cTargeting: ${selector}`, "color: cyan; font-weight: bold;");

  // --- Strategy 1: Standard .click() ---
  console.log("1. Trying standard element.click()...");
  element.focus();
  element.click();
  await wait(3000);

  // --- Strategy 2: Pointer Event Sequence ---
  console.log("2. Trying PointerEvent sequence (down/move/up)...");
  element.dispatchEvent(new PointerEvent("pointerdown", coords));
  element.dispatchEvent(new PointerEvent("pointermove", coords));
  element.dispatchEvent(new PointerEvent("pointerup", coords));
  await wait(3000);

  // --- Strategy 3: Full MouseEvent Sequence ---
  console.log("3. Trying MouseEvent sequence (mousedown/mouseup/click)...");
  element.dispatchEvent(new MouseEvent("mousedown", coords));
  element.dispatchEvent(new MouseEvent("mouseup", coords));
  element.dispatchEvent(new MouseEvent("click", coords));
  await wait(3000);

  // --- Strategy 4: Prototype Invocation (Bypasses site-level overrides) ---
  console.log("4. Trying HTMLElement Prototype click...");
  try {
    HTMLElement.prototype.click.call(element);
  } catch (e) {
    console.error(e);
  }
  await wait(3000);

  // --- Strategy 5: Element From Point (Bypasses invisible overlays) ---
  console.log("5. Trying click via document.elementFromPoint...");
  const topEl = document.elementFromPoint(coords.clientX, coords.clientY);
  if (topEl) {
    topEl.click();
    topEl.dispatchEvent(new MouseEvent("click", coords));
  }
  await wait(3000);

  // --- Strategy 6: Form Submission (Fallback for buttons in forms) ---
  if (element.closest("form")) {
    console.log("6. Detected a form; trying to submit parent form...");
    element.closest("form").requestSubmit();
  } else {
    console.log("6. (Skipped form submission - no parent form found)");
  }

  console.log(
    "%cAll strategies exhausted.",
    "color: orange; font-weight: bold;",
  );
}

// Usage:
// bruteForceClick('.your-button-class');
