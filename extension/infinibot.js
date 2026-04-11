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

  let focusMode = "None";
  let focusQueue = [];
  let currentAIndex = 0;

  let sessionNewCount = 0;
  let totalDiscoveryCount = 0;
  let sessionDiscoveryCount = 0;

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

    // Seed initial items
    getSidebarItems();

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

    ui.updateStats();
    ui.log("Click ▶️ above to begin");

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
        "#666",
      );

      await clearCanvas();
      await combineItems(itemA, itemB);
      await clearCanvas();
    }
  }

  // --- MEANINGFUL FUNCTIONS (Core logic broken out) ---
  async function findNextCombinationPair() {
    let sidebarItems = getSidebarItems();

    if (focusMode !== "None") {
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
      focusMode = "None";
      if (ui.focusInput) ui.focusInput.value = "None";
      return null;
    } else {
      // --- Systematic Logic ---
      let foundPair = false;
      for (let i = currentAIndex; i < sidebarItems.length; i++) {
        const candA = sidebarItems[i];
        for (const candB of sidebarItems) {
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
        ui.log("All combinations tried! Waiting for new items...", "#999");
        await wait(5000);
        checkForNewItems(); // check if items were added manually
        return null;
      }
    }
  }

  async function combineItems(itemA, itemB) {
    simulateClick(itemA.el, false);
    await wait(100);
    simulateClick(itemB.el, false);
    await wait(100);

    const instances = document.querySelectorAll(".instance");
    if (instances.length >= 2) {
      const el1 = instances[instances.length - 2];
      const el2 = instances[instances.length - 1];
      await simulateDragAndDrop(el1, el2);

      // Wait for craft to process
      const waitMs = 1400 + Math.floor(Math.random() * 200);
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
          "#000",
        );

        if (focusMode !== "None" && resultText) {
          if (!focusQueue.includes(resultText)) {
            focusQueue.push(resultText);
            ui.updateStats();
          }
        }
      } else {
        ui.log(
          `Dragged ${itemA.text} onto ${itemB.text} and got nothing`,
          "#999",
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
          seenItems.set(text, { emoji, text });
        }
      }
    });
    return items;
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
  };

  function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

  async function checkPause() {
    while (!isRunning) await wait(500);
  };

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
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const data = {
        id: `${itemA}|||${itemB}`,
        itemA: itemA,
        itemB: itemB,
        result: resultText,
        timestamp: Date.now(),
      };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  function getCombination(db, itemA, itemB) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(`${itemA}|||${itemB}`);
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
      zIndex: "999998",
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
      zIndex: "999999",
      width: "540px",
      backgroundColor: "#fff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      padding: "10px",
      fontFamily: "sans-serif",
      fontSize: "12px",
      color: "#333",
    });

    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
    });

    const title = document.createElement("h3");
    title.innerText = "InfiniBot 2.0";
    title.style.margin = "0";

    const btn = document.createElement("button");
    btn.innerHTML = "🤖 ▶️ Play";
    Object.assign(btn.style, {
      padding: "4px 12px",
      cursor: "pointer",
      borderRadius: "4px",
      border: "1px solid #ccc",
      background: "#f9f9f9",
      fontWeight: "bold",
      fontSize: "13px",
    });

    btn.onclick = () => {
      isRunning = !isRunning;
      btn.innerHTML = isRunning ? "🤖 ⏸️ Pause" : "🤖 ▶️ Play";
      btn.style.background = isRunning ? "#e6ffe6" : "#f9f9f9";
      overlay.style.display = isRunning ? "block" : "none";
      if (ui) ui.setPhase(isRunning ? currentPhase : "Pausing");
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
    });

    const focusLabel = document.createElement("strong");
    focusLabel.innerText = "Focus Area: ";
    focusLabel.style.marginRight = "10px";

    const focusInput = document.createElement("input");
    focusInput.setAttribute("list", "infinibot-focus-items");
    focusInput.placeholder = 'Type to focus (or "None")';
    focusInput.value = "None";
    focusInput.style.width = "200px";
    focusInput.style.padding = "4px";

    const datalist = document.createElement("datalist");
    datalist.id = "infinibot-focus-items";

    focusInput.onchange = (e) => {
      const val = e.target.value;
      if (!val || val.toLowerCase() === "none") {
        focusMode = "None";
        focusInput.value = "None";
        focusQueue = [];
        ui.log(`Set focus to: Systemic mode (None)`);
      } else {
        focusMode = val;
        focusQueue = [val];
        ui.log(`Set focus to: ${val}`);
      }
      updateStatsUI();
    };

    focusRow.appendChild(focusLabel);
    focusRow.appendChild(focusInput);
    focusRow.appendChild(datalist);

    // Stats Row
    const statsRow = document.createElement("div");
    statsRow.style.fontSize = "12px";
    statsRow.style.color = "#555";
    statsRow.style.marginBottom = "10px";
    statsRow.style.fontWeight = "bold";
    statsRow.innerText = "Combos tried: ... | Untested: ... | Focus Queue: ...";

    const createLogBox = (titleText) => {
      const wrap = document.createElement("div");
      const label = document.createElement("strong");
      label.innerText = titleText;
      label.style.display = "block";
      label.style.fontSize = "12px";
      label.style.marginTop = "8px";
      label.style.marginBottom = "2px";

      const logArea = document.createElement("div");
      Object.assign(logArea.style, {
        height: "80px",
        overflowY: "auto",
        background: "#f4f4f4",
        border: "1px inset #ddd",
        fontSize: "11px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
      });

      wrap.appendChild(label);
      wrap.appendChild(logArea);
      return { wrap, logArea, label };
    };

    const generalLog = createLogBox("📜 General Log (Pausing)");
    const itemsLog = createLogBox("🆕 New Items This Session (0)");
    const discLog = createLogBox(
      "✨ All First Discoveries (0 - 0 this session)",
    );

    container.appendChild(headerRow);
    container.appendChild(focusRow);
    container.appendChild(statsRow);
    container.appendChild(generalLog.wrap);
    container.appendChild(itemsLog.wrap);
    container.appendChild(discLog.wrap);

    document.body.appendChild(container);

    const addLog = (area, msg, color = "#333") => {
      const el = document.createElement("div");
      el.innerText = msg;
      el.style.borderBottom = "1px solid #eee";
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

      itemsLog.label.innerText = `🆕 New Items This Session (${sessionNewCount}) - Total Known: ${totalItems}`;
      discLog.label.innerText = `✨ All First Discoveries (${totalDiscoveryCount} - ${sessionDiscoveryCount} this session)`;

      // Update datalist
      datalist.innerHTML = '<option value="None"></option>';
      for (const text of seenItems.keys()) {
        const opt = document.createElement("option");
        opt.value = text;
        datalist.appendChild(opt);
      }
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

