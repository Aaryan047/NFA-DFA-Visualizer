Here’s a clean, serious README based on your project. No fluff, just something you can actually put on GitHub.

---

# Visual Automata Designer

An interactive web-based tool for designing **Nondeterministic Finite Automata (NFA)** and converting them into **Deterministic Finite Automata (DFA)** using the subset construction algorithm.

Built as a learning + visualization tool for Automata Theory, combining formal concepts with an intuitive UI.

---

## Overview

This project allows users to:

* Visually construct NFAs by adding states and transitions
* Define custom alphabets (including ε-transitions)
* Mark start and final states
* Convert the NFA into an equivalent DFA
* Observe step-by-step conversion logs
* View the resulting DFA graph and transition table

It also includes a built-in **theory section** explaining the core concepts behind automata.

The UI is designed to feel like a “lab environment” rather than a basic tool, with multiple themes and smooth interaction.

---

## Features

### Automata Design

* Add, move, and delete states interactively
* Double-click to create transitions
* Supports ε-transitions
* Custom alphabet editor with validation
* Start and final state selection

### Conversion Engine

* Implements **subset construction algorithm**
* Step-by-step logging of conversion process
* Automatic DFA generation and rendering
* DFA transition table visualization

### UI/UX

* Multiple themes (Dark Lab, Dark Rose, Light Paper, Light Mint)
* Resizable panels (sidebar, canvas, logs)
* Undo/Redo functionality
* Live transition preview (rubber-band edge drawing)
* Clean grid-based canvas with SVG rendering

### Learning Support

* Integrated theory tab covering:

  * Regular languages
  * Regular expressions
  * NFA & DFA definitions
  * Subset construction
* Designed for viva, coursework, and self-study

---

## Tech Stack

* **HTML5** – structure and layout 
* **CSS3** – theming, layout system, UI styling 
* **Vanilla JavaScript** – logic, rendering, and interaction 
* **SVG** – graph rendering for automata

No frameworks, no libraries. Everything is built from scratch.

---

## Project Structure

```
├── index.html     # Main UI + theory content
├── styles.css     # Themes, layout, design system
├── script.js      # Core logic (NFA model, rendering, conversion)
```

---

## How to Run

### Option 1: Local

Just open `index.html` in your browser.

### Option 2: Deploy (Recommended)

Use Netlify or Vercel for hosting.

* Drag and drop the project folder into Netlify
* Or connect your GitHub repo for auto-deploy

---

## How to Use

1. Add states using the sidebar
2. Define your alphabet
3. Set start and final states
4. Create transitions (double-click → select target → choose symbol)
5. Click **Convert to DFA**
6. Observe:

   * Step log (right panel)
   * DFA visualization
   * Transition table

---

## Key Implementation Details

* NFA is stored as a structured object:

  * States, start state, final states, transitions
* Conversion uses:

  * ε-closure computation
  * State-set expansion (powerset construction)
* Edge rendering:

  * Curved edges for bidirectional transitions
  * Grouped labels for multiple symbols
* UI state is managed manually (no frameworks)

---

## Limitations

* No DFA minimization yet
* No persistent storage (session-only)
* Large NFAs may become visually cluttered
* No import/export of automata

---

## Future Improvements

* DFA minimization (Myhill–Nerode / table-filling)
* Save/load automata (JSON)
* Export diagrams (PNG/SVG)
* Regex → NFA (Thompson construction)
* Better layout algorithms for large graphs

---

## Use Cases

* Automata Theory coursework
* Viva preparation
* Concept visualization
* Teaching / demonstrations

---

## Author

Aaryan Vinod Kumar
