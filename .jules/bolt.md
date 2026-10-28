## 2024-05-19 - Avoid full store destructuring
**Learning:** Destructuring zustand's `useStore` in React components leads to unnecessary re-renders when other state properties change (like `elapsedTime`).
**Action:** Use `useShallow` or select specific properties directly when consuming state in components.
