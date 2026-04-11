infiniteCraftBot();
async function infiniteCraftBot() {
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  while (true) {
    const buttons = document.querySelectorAll("[data-item-text");
    const randomIndex = Math.floor(Math.random() * buttons.length);
    const button = buttons[randomIndex];
    simulateClick(button);
    await wait(100);
  }
}
async function simulateClick(element) {
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
  console.log("Clicked ", element.dataset.itemText);
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

  console.log(
    `Dragging from (${from.clientX}, ${from.clientY}) to (${to.clientX}, ${to.clientY})`,
  );

  // 1. Mousedown on the source element
  element1.dispatchEvent(
    new MouseEvent("mousedown", { ...options, ...from, which: 1, buttons: 1 }),
  );

  // 2. Dragstart (some libraries specifically listen for this)
  element1.dispatchEvent(new DragEvent("dragstart", { ...options, ...from }));

  // 3. Mousemove to the destination (The "Travel")
  // We send a move event at the destination to trigger "hover/over" states
  element2.dispatchEvent(
    new MouseEvent("mousemove", { ...options, ...to, which: 1, buttons: 1 }),
  );
  element2.dispatchEvent(new DragEvent("dragover", { ...options, ...to }));

  // 4. Mouseup / Drop
  element2.dispatchEvent(new MouseEvent("mouseup", { ...options, ...to }));
  element2.dispatchEvent(new DragEvent("drop", { ...options, ...to }));

  // 5. Dragend on the original element
  element1.dispatchEvent(new DragEvent("dragend", { ...options, ...to }));

  console.log("Drop sequence complete.");
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
