## 2025-02-27 - Prevent React Re-renders by Replacing useStore() with useShallow

**Learning:** When using Zustand, destructuring the whole store like `const { a, b } = useStore()` causes the component to re-render whenever ANY property in the store changes. In an application with highly dynamic state (like a timer running, or dragging elements), this leads to massive, widespread unnecessary re-renders in major wrapper components (e.g. `App.tsx`, `AdminView`, `MatchView`, etc).
**Action:** Replace all `const { x, y } = useStore()` with `const { x, y } = useStore(useShallow(state => ({ x: state.x, y: state.y })))` to subscribe ONLY to the selected state properties. Use AST transformations (like `ts-morph`) to safely find and modify all instances programmatically.
