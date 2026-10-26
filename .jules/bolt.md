## 2024-05-24 - [Avoid Destructuring Zustand Store in React Components]
**Learning:** Destructuring the entire Zustand store (e.g., `const { elapsedTime } = useStore()`) causes massive unnecessary re-renders in components when frequently updating global state variables like `elapsedTime` change.
**Action:** Always use `useShallow` from `zustand/react/shallow` (e.g., `useStore(useShallow(state => ({ ... })))`) or select specific properties (e.g., `useStore(state => state.property)`) instead of destructuring the entire store.
