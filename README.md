# InfiniBot 2.0

InfiniBot 2.0 is an automated script to systematically discover new combinations in Neal.fun's Infinite Craft. It tracks what it has tried using your browser's IndexedDB so it never repeats combos, and it offers both a "Systematic" mode to try everything and a "Focus" mode to quickly drill down into the resulting combinations from a single item.

## Features

- **Systematic Crafting:** Automatically pairs items with each other so you don't have to randomly click around. 
- **Focus Area:** Select a specific item to focus on. InfiniBot will pair everything against it, and then recursively pair against any new items discovered from those combinations!
- **Data Persistence:** Uses IndexedDB to remember every combination tried. Even if you refresh, it knows exactly where it left off.
- **Detailed Logging & Stats:** Tracks your discoveries, combo counts, and untested items in a clean, overlay UI.

## How to Install

You can run InfiniBot either as a permanent browser extension or via a quick copy-paste into your browser's console.

### Option 1: As a Browser Extension (Dev Mode)

1. Clone or download this repository.
2. Open your browser's extension page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Firefox: `about:debugging#/runtime/this-firefox`
3. Enable **Developer mode** (usually a toggle in the top right).
4. Click **Load unpacked** (or "Load Temporary Add-on" in Firefox).
5. Select the `extension/` folder from this repository.
6. Navigate to Infinite Craft (neal.fun/infinite-craft). The bot UI will appear in the top-left corner.

### Option 2: As a Console Snippet

If you just want to run it without installing anything:

1. Open Infinite Craft in your browser (neal.fun/infinite-craft).
2. Open the Developer Tools console (press `F12` or `Ctrl+Shift+I` / `Cmd+Option+I` and click the **Console** tab).
3. Copy the entire contents of the `extension/infinibot.js` file.
4. Paste it into the console and hit **Enter**.
5. The bot UI will appear in the top-left corner!
