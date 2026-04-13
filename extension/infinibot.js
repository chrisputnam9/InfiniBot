(function () {
  const DB_NAME = "InfiniBotDB";
  const DB_VERSION = 1;
  const STORE_NAME = "combinations";

  let isRunning = false;
  let currentPhase = "Pausing";
  let ui;
  const seenItems = new Map(); // Store item text -> { emoji, text }
  let overlay;
  let db;

  let focusMode = "";
  let focusQueue = [];
  let currentAIndex = 0;

  let sessionNewCount = 0;
  let totalDiscoveryCount = 0;
  let sessionDiscoveryCount = 0;

  const modalStyle = document.createElement("style");
  modalStyle.id = "infinibot-modal-hider";
  modalStyle.innerHTML = `
    dialog, dialog::backdrop {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  function hideGameModals() {
    if (!document.head.contains(modalStyle)) {
      document.head.appendChild(modalStyle);
    }
  }

  function showGameModals() {
    if (document.head.contains(modalStyle)) {
      modalStyle.remove();
    }
  }

  // --- CORE BOT FLOW ---
  async function infiniteCraftBot() {
    ui = setupUI();

    try {
      db = await initDB();
    } catch (e) {
      console.error("Failed to initialize IndexedDB", e);
      ui.log("Error: Could not initialize database.", "red");
      return;
    }

    ui.log("Waiting for sidebar to load...");
    await new Promise((resolve) => {
      let lastActual = 0;
      let consecutiveMatches = 0;
      const checkLoad = () => {
        const countEl = document.querySelector(".sidebar-section-title");
        let expected = 0;
        if (countEl) {
          const match = countEl.textContent.match(/Items\s+(\d+)/);
          if (match) {
            expected = parseInt(match[1], 10);
          } else {
            const span = countEl.querySelector(".sidebar-section-count");
            if (span) {
              expected = parseInt(span.textContent, 10);
            }
          }
        }

        const sidebar = document.querySelector("#sidebar");
        if (sidebar) {
          getSidebarItems(); // Parse whatever is currently in view

          const actual = seenItems.size;

          if (actual >= expected && expected > 0) {
            ui.log(`Sidebar fully loaded! (${actual}/${expected})`);
            resolve();
            return;
          }

          // Scroll down to load more items
          sidebar.scrollTop = sidebar.scrollHeight;

          if (actual === lastActual && actual > 0) {
            consecutiveMatches++;
            if (consecutiveMatches > 10) {
              // Give it some time to load
              ui.log(
                `Sidebar loaded (stopped expanding)! (${actual}/${expected})`,
              );
              resolve();
              return;
            }
          } else {
            consecutiveMatches = 0;
            lastActual = actual;
          }
          ui.log(`Sidebar check: Expected=${expected}, Known=${actual}`);
        } else {
          ui.log(`Waiting for #sidebar to appear...`);
        }

        setTimeout(checkLoad, 500);
      };
      checkLoad();
    });

    // Reset scroll to top
    const sidebar = document.querySelector("#sidebar");
    if (sidebar) {
      sidebar.scrollTop = 0;
    }

    // Initial populate of UI
    await ui.updateStats();

    // Count initial discoveries
    document.querySelectorAll(".item").forEach((el) => {
      if (
        el.innerHTML.includes("First Discovery") ||
        el.classList.contains("item-discovery")
      ) {
        const emoji =
          el.querySelector(".item-emoji")?.textContent ||
          el.dataset.itemEmoji ||
          "";
        let text =
          el.dataset.itemText ||
          el.textContent
            .replace(emoji, "")
            .replace("First Discovery", "")
            .trim();
        totalDiscoveryCount++;
        ui.logDiscovery(`(Past) ${emoji} ${text}`);
      }
    });

    await ui.updateStats();
    ui.log("Click Play to begin");

    // Periodically check for new items (e.g. if user crafts manually while paused)
    setInterval(() => {
      checkForNewItems();
    }, 2000);

    while (true) {
      await checkPause();
      currentPhase = "Searching...";
      ui.setPhase(currentPhase);

      const pair = await findNextCombinationPair();
      if (!pair) {
        continue;
      }

      const { itemA, itemB } = pair;

      await checkPause();
      currentPhase = "Combining";
      ui.setPhase(currentPhase);

      ui.log(
        `Combining ${itemA.emoji} ${itemA.text} + ${itemB.emoji} ${itemB.text}...`,
        "#a6adc8",
      );

      await clearCanvas();
      await combineItems(itemA, itemB);
      await clearCanvas();
    }
  }

  // --- MEANINGFUL FUNCTIONS (Core logic broken out) ---
  async function findNextCombinationPair() {
    let sidebarItems = getSidebarItems();

    if (focusMode !== "") {
      // --- Focus Area (BFS) Logic ---
      while (focusQueue.length > 0) {
        const candidateA = focusQueue[0]; // peek
        let foundB = false;

        for (const candB of sidebarItems) {
          const combo = await getCombination(db, candidateA, candB.text);
          if (combo === undefined) {
            const aItem = sidebarItems.find((i) => i.text === candidateA);
            if (aItem) {
              return { itemA: aItem, itemB: candB };
            }
          }
        }
        if (!foundB) {
          focusQueue.shift(); // Exhausted candidateA
          ui.updateStats();
        }
      }

      ui.log(
        `Focus queue for "${focusMode}" exhausted. Returning to Systemic mode.`,
      );
      focusMode = "";
      if (ui.focusInput) ui.focusInput.value = "";
      return null;
    } else {
      // --- Systematic Logic ---
      let foundPair = false;
      for (let i = currentAIndex; i < sidebarItems.length; i++) {
        const candA = sidebarItems[i];
        for (let j = i; j < sidebarItems.length; j++) {
          const candB = sidebarItems[j];
          const combo = await getCombination(db, candA.text, candB.text);
          if (combo === undefined) {
            currentAIndex = i;
            return { itemA: candA, itemB: candB };
          }
        }
      }

      if (currentAIndex > 0) {
        currentAIndex = 0; // Loop back
        return null;
      } else {
        ui.log("All combinations tried! Waiting for new items...", "#a6adc8");
        await wait(5000);
        checkForNewItems(); // check if items were added manually
        return null;
      }
    }
  }

  async function combineItems(itemA, itemB) {
    if (!itemA.el || !document.body.contains(itemA.el)) {
      itemA.el = await findOrScrollToItem(itemA.text);
    }
    if (!itemA.el) {
      ui.log(`Could not find element for ${itemA.text} to click`, "red");
      return;
    }
    simulateClick(itemA.el, false);
    await wait(100);

    if (!itemB.el || !document.body.contains(itemB.el)) {
      itemB.el = await findOrScrollToItem(itemB.text);
    }
    if (!itemB.el) {
      ui.log(`Could not find element for ${itemB.text} to click`, "red");
      return;
    }
    simulateClick(itemB.el, false);
    await wait(100);

    const instances = document.querySelectorAll(".instance");
    if (instances.length >= 2) {
      const el1 = instances[instances.length - 2];
      const el2 = instances[instances.length - 1];
      await simulateDragAndDrop(el1, el2);

      // Wait for craft to process
      const waitMs = 200 + Math.floor(Math.random() * 200);
      await wait(waitMs);

      // Verification
      const newInstances = document.querySelectorAll(".instance");
      let resultText = null;
      let resultEmoji = null;

      if (newInstances.length === 1) {
        const resEl = newInstances[0];
        resultEmoji =
          resEl.querySelector(".instance-emoji")?.textContent ||
          resEl.dataset.itemEmoji ||
          "";
        resultText = (
          resEl.querySelector(".instance-text")?.textContent ||
          resEl.textContent
        )
          .replace(resultEmoji, "")
          .trim();
        ui.log(
          `Dragged ${itemA.text} onto ${itemB.text} and got: ${resultEmoji} ${resultText}`,
          "#cdd6f4",
        );

        if (focusMode !== "" && resultText) {
          if (!focusQueue.includes(resultText)) {
            focusQueue.push(resultText);
            ui.updateStats();
          }
        }
      } else {
        ui.log(
          `Dragged ${itemA.text} onto ${itemB.text} and got nothing`,
          "#a6adc8",
        );
      }

      // Save to IndexedDB
      await saveCombination(db, itemA.text, itemB.text, resultText);
      ui.updateStats();

      checkForNewItems();
    }
  }

  async function clearCanvas() {
    const instances = document.querySelectorAll(".instance");
    if (instances.length === 0) {
      return;
    }

    const clearBtn =
      document.querySelector(".clear.tool-icon") ||
      document.querySelector('[data-tooltip="Clear Canvas"]');
    if (clearBtn) {
      simulateClick(clearBtn, false);
      await wait(50);
      const yesBtn = document.querySelector(".action-btn.action-danger");
      if (yesBtn) {
        simulateClick(yesBtn, false); // no log
      }
    }
  }

  async function findOrScrollToItem(text) {
    const sidebar = document.querySelector("#sidebar");
    if (!sidebar) return null;

    // 1. Check if it's currently on screen
    getSidebarItems(); // updates element references
    let itemInfo = seenItems.get(text);
    if (itemInfo && itemInfo.el && document.body.contains(itemInfo.el)) {
      return itemInfo.el;
    }

    // 2. Search for it by scrolling
    ui.log(`Searching for off-screen item: ${text}...`);
    const searchInput = document.querySelector(".sidebar-search");

    if (searchInput) {
      // Try using the native search box first
      searchInput.value = text;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(200);

      getSidebarItems();
      itemInfo = seenItems.get(text);
      if (itemInfo && itemInfo.el && document.body.contains(itemInfo.el)) {
        // clear search
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(100);
        return itemInfo.el;
      }

      // clear search if not found
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(100);
    }

    // Fallback to manual scrolling
    sidebar.scrollTop = 0;
    await wait(50);

    let lastScrollTop = -1;
    while (sidebar.scrollTop !== lastScrollTop) {
      lastScrollTop = sidebar.scrollTop;
      getSidebarItems();
      itemInfo = seenItems.get(text);
      if (itemInfo && itemInfo.el && document.body.contains(itemInfo.el)) {
        return itemInfo.el;
      }
      sidebar.scrollTop += 5000; // scroll down a chunk
      await wait(50);
    }

    return null;
  }

  function getSidebarItems() {
    const items = [];
    document.querySelectorAll(".item").forEach((el) => {
      const emoji =
        el.querySelector(".item-emoji")?.textContent ||
        el.dataset.itemEmoji ||
        "";
      let text = el.dataset.itemText;
      if (!text) {
        text = el.textContent
          .replace(emoji, "")
          .replace("First Discovery", "")
          .trim();
      }
      if (text) {
        items.push({ text, emoji, el });
        if (!seenItems.has(text)) {
          seenItems.set(text, { emoji, text, el });
        } else {
          // Update the element reference if it has been re-rendered
          seenItems.get(text).el = el;
        }
      }
    });

    // We want to return a list of all *known* items, and map them to their elements.
    // If an item is off-screen (due to virtualization), we need to ensure we can scroll to it later.
    // For now, returning seenItems converted to an array, using whatever `el` we had last.
    const knownItems = Array.from(seenItems.values());
    return knownItems;
  }

  function checkForNewItems() {
    let newItemsFound = false;
    document.querySelectorAll(".item").forEach((el) => {
      const emoji =
        el.querySelector(".item-emoji")?.textContent ||
        el.dataset.itemEmoji ||
        "";
      let text = el.dataset.itemText;
      if (!text) {
        text = el.textContent
          .replace(emoji, "")
          .replace("First Discovery", "")
          .trim();
      }

      if (text && !seenItems.has(text)) {
        seenItems.set(text, { emoji, text });
        sessionNewCount++;
        newItemsFound = true;
        ui.logItem(`${emoji} ${text}`);

        if (
          el.innerHTML.includes("First Discovery") ||
          el.classList.contains("item-discovery")
        ) {
          totalDiscoveryCount++;
          sessionDiscoveryCount++;
          ui.logDiscovery(`${emoji} ${text}`);
        }
      }
    });

    if (newItemsFound) {
      ui.updateStats();
    }
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function checkPause() {
    if (!isRunning) {
      showGameModals();
      while (!isRunning) await wait(500);
      hideGameModals();
    }
  }

  async function simulateClick(element, log = true) {
    const rect = element.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
      view: window,
    };
    element.dispatchEvent(new MouseEvent("mousedown", coords));
    element.dispatchEvent(new MouseEvent("mouseup", coords));
    element.dispatchEvent(new MouseEvent("click", coords));

    if (log) {
      const emoji =
        element.querySelector(".item-emoji")?.textContent ||
        element.dataset.itemEmoji ||
        "";
      let text = element.dataset.itemText;
      if (!text) {
        text = element.textContent
          .replace(emoji, "")
          .replace("First Discovery", "")
          .trim();
      }
      ui.log(`Clicked ${emoji} ${text}`);
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

    element1.dispatchEvent(
      new MouseEvent("mousedown", {
        ...options,
        ...from,
        which: 1,
        buttons: 1,
      }),
    );
    element1.dispatchEvent(new DragEvent("dragstart", { ...options, ...from }));
    element2.dispatchEvent(
      new MouseEvent("mousemove", { ...options, ...to, which: 1, buttons: 1 }),
    );
    element2.dispatchEvent(new DragEvent("dragover", { ...options, ...to }));
    element2.dispatchEvent(new MouseEvent("mouseup", { ...options, ...to }));
    element2.dispatchEvent(new DragEvent("drop", { ...options, ...to }));
    element1.dispatchEvent(new DragEvent("dragend", { ...options, ...to }));
  }

  // --- IndexedDB Logic ---
  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = (event) => reject(event.target.error);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("itemA", "itemA", { unique: false });
          store.createIndex("itemB", "itemB", { unique: false });
        }
      };
    });
  }

  function saveCombination(db, itemA, itemB, resultText) {
    // Sort items to enforce A+B = B+A
    const sorted = [itemA, itemB].sort();
    const keyA = sorted[0];
    const keyB = sorted[1];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const data = {
        id: `${keyA}|||${keyB}`,
        itemA: keyA,
        itemB: keyB,
        result: resultText,
        timestamp: Date.now(),
      };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  function getCombination(db, itemA, itemB) {
    // Sort items to enforce A+B = B+A
    const sorted = [itemA, itemB].sort();
    const keyA = sorted[0];
    const keyB = sorted[1];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(`${keyA}|||${keyB}`);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  function countCombinations(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // --- UI Setup ---
  function setupUI() {
    if (document.getElementById("infinibot-ui")) {
      document.getElementById("infinibot-ui").remove();
    }
    if (document.getElementById("infinibot-overlay")) {
      document.getElementById("infinibot-overlay").remove();
    }

    // Create overlay
    overlay = document.createElement("div");
    overlay.id = "infinibot-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      zIndex: "2147483646",
      display: "none",
      pointerEvents: "auto",
    });
    document.body.appendChild(overlay);

    const container = document.createElement("div");
    container.id = "infinibot-ui";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      left: "20px",
      zIndex: "2147483647",
      width: "540px",
      height: "80vh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#1e1e2e",
      border: "1px solid #313244",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      padding: "10px",
      fontFamily: "sans-serif",
      fontSize: "12px",
      color: "#cdd6f4",
      opacity: "0.2",
      transition: "opacity 0.2s ease-in-out",
    });

    container.addEventListener("mouseenter", () => {
      container.style.opacity = "0.9";
    });
    container.addEventListener("mouseleave", () => {
      container.style.opacity = "0.2";
    });

    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
      flexShrink: "0",
    });

    const title = document.createElement("h3");
    title.innerText = "InfiniBot 2.0";
    title.style.margin = "0";

    const btn = document.createElement("button");
    btn.id = "infinibot-play-btn";
    btn.innerHTML = "🤖 ▶️ Play";
    Object.assign(btn.style, {
      padding: "4px 12px",
      cursor: "pointer",
      borderRadius: "4px",
      border: "1px solid #45475a",
      background: "#313244",
      color: "#cdd6f4",
      fontWeight: "bold",
      fontSize: "13px",
    });

    btn.onclick = () => {
      isRunning = !isRunning;
      btn.innerHTML = isRunning ? "🤖 ⏸️ Pause" : "🤖 ▶️ Play";
      btn.style.background = isRunning ? "#a6e3a1" : "#313244";
      btn.style.color = isRunning ? "#11111b" : "#cdd6f4";
      
      overlay.style.display = isRunning ? "block" : "none";

      if (isRunning) {
        hideGameModals();
      }

      if (ui) ui.setPhase(isRunning ? currentPhase : "Pausing");

      // Toggle focus area disabled state
      focusInput.disabled = isRunning;
      focusInput.title = isRunning ? "Pause to edit focus area" : "";
    };

    headerRow.appendChild(title);
    headerRow.appendChild(btn);

    // Focus Area Row
    const focusRow = document.createElement("div");
    Object.assign(focusRow.style, {
      display: "flex",
      alignItems: "center",
      marginBottom: "10px",
      fontSize: "13px",
      flexShrink: "0",
    });

    const focusLabel = document.createElement("strong");
    focusLabel.innerText = "Focus Area: ";
    focusLabel.style.marginRight = "10px";

    const focusInput = document.createElement("input");
    focusInput.setAttribute("list", "infinibot-focus-items");
    focusInput.placeholder = "Type to focus (blank for systemic)";
    focusInput.value = "";
    focusInput.style.width = "400px";
    focusInput.style.padding = "4px";
    focusInput.style.background = "#181825";
    focusInput.style.border = "1px solid #45475a";
    focusInput.style.color = "#cdd6f4";
    focusInput.style.borderRadius = "4px";

    const datalist = document.createElement("datalist");
    datalist.id = "infinibot-focus-items";
    container.appendChild(datalist); // Ensure it's in the DOM

    focusInput.onchange = (e) => {
      const val = e.target.value;
      if (!val) {
        focusMode = "";
        focusInput.value = "";
        focusQueue = [];
        ui.log(`Set focus to: Systemic mode`);
      } else {
        let foundText = val;
        for (const [text, info] of seenItems.entries()) {
          if (val === text || val === `${info.emoji} ${text}`) {
            foundText = text;
            break;
          }
        }
        focusMode = foundText;
        focusQueue = [foundText];
        ui.log(`Set focus to: ${foundText}`);
      }
      ui.updateStats();
    };

    focusRow.appendChild(focusLabel);
    focusRow.appendChild(focusInput);
    focusRow.appendChild(datalist);

    // Stats Row
    const statsRow = document.createElement("div");
    statsRow.style.fontSize = "12px";
    statsRow.style.color = "#a6adc8";
    statsRow.style.marginBottom = "10px";
    statsRow.style.fontWeight = "bold";
    statsRow.style.flexShrink = "0";
    statsRow.innerText = "Combos tried: ... | Untested: ... | Focus Queue: ...";

    const createLogBox = (titleText) => {
      const wrap = document.createElement("div");
      const label = document.createElement("strong");
      label.innerText = titleText;
      label.style.display = "block";
      label.style.fontSize = "12px";
      label.style.marginBottom = "2px";
      label.style.color = "#bac2de";
      label.style.flexShrink = "0";

      const logArea = document.createElement("div");
      Object.assign(logArea.style, {
        flex: "1 1 0",
        minHeight: "0",
        overflowY: "auto",
        background: "#11111b",
        border: "1px inset #45475a",
        fontSize: "11px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
      });

      wrap.appendChild(label);
      wrap.appendChild(logArea);
      Object.assign(wrap.style, {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0",
        minHeight: "0",
      });
      return { wrap, logArea, label };
    };

    const generalLog = createLogBox("📜 General Log (Pausing)");
    const itemsLog = createLogBox("🆕 New Items This Session (0)");
    const discLog = createLogBox(
      "✨ First Discoveries This Session (0 - Total: 0)",
    );

    // Group log boxes in a flex container so they expand equally
    const logsContainer = document.createElement("div");
    Object.assign(logsContainer.style, {
      display: "flex",
      flexDirection: "column",
      flexGrow: "1",
      minHeight: "0",
      gap: "10px",
    });

    logsContainer.appendChild(generalLog.wrap);
    logsContainer.appendChild(itemsLog.wrap);
    logsContainer.appendChild(discLog.wrap);

    container.appendChild(headerRow);
    container.appendChild(focusRow);
    container.appendChild(statsRow);
    container.appendChild(logsContainer);

    document.body.appendChild(container);

    const addLog = (area, msg, color = "#cdd6f4") => {
      const el = document.createElement("div");
      el.innerText = msg;
      el.style.borderBottom = "1px solid #313244";
      el.style.padding = "2px 0";
      el.style.color = color;
      area.prepend(el);
      return el;
    };

    const updateStatsUI = async () => {
      if (!db) return;
      const tried = await countCombinations(db);
      const totalItems = seenItems.size;
      const totalCombos = totalItems * totalItems;
      const untested = totalCombos - tried;
      statsRow.innerText = `Combos tried: ${tried} | Untested: ${untested} | Focus Queue: ${focusQueue.length}`;

      itemsLog.label.innerText = `🆕 New Items This Session (${sessionNewCount} - Total: ${totalItems})`;
      discLog.label.innerText = `✨ First Discoveries This Session (${sessionDiscoveryCount} - Total: ${totalDiscoveryCount})`;

      // Update datalist
      const currentVal = focusInput.value;
      datalist.innerHTML = "";
      const sortedItems = Array.from(seenItems.values()).sort((a, b) =>
        a.text.localeCompare(b.text),
      );
      for (const item of sortedItems) {
        const opt = document.createElement("option");
        opt.value = `${item.emoji} ${item.text}`;
        datalist.appendChild(opt);
      }
      focusInput.value = currentVal;
    };

    return {
      setPhase: (phase) => {
        if (generalLog && generalLog.label) {
          generalLog.label.innerText = `📜 General Log (${phase})`;
        }
      },
      log: (msg, color) => addLog(generalLog.logArea, msg, color),
      logItem: (msg) => addLog(itemsLog.logArea, msg),
      logDiscovery: (msg) => addLog(discLog.logArea, msg),
      updateStats: updateStatsUI,
      focusInput,
    };
  }

  // --- Initialization Logic ---
  function init() {
    if (document.querySelector(".item") || document.querySelector(".sidebar")) {
      infiniteCraftBot();
    } else {
      setTimeout(init, 500);
    }
  }

  init();
})();
