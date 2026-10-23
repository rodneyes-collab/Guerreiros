## 2023-10-24 - [Zustand Re-render Optimization]
**Learning:** `useStore()` destructuring without selectors or `useShallow` triggers massive re-renders across the app, especially in large components like `MatchView` which consumes frequently updating global state like `elapsedTime` (updates every second!).
**Action:** Always wrap `useStore` destructuring with `useShallow` when selecting multiple state slices, e.g. `const { ... } = useStore(useShallow(state => ({ ... })))` to prevent unnecessary deep re-renders on unrelated state changes.
