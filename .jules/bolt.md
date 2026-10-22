## 2023-11-23 - Zustand Re-renders with elapsedTime
**Learning:** Destructuring `useStore()` when any frequently updated value (like `elapsedTime`, updated every second) is present causes massive re-renders across the entire application, even if the component doesn't use the specific value.
**Action:** Use `useStore(state => state.property)` for specific values, or `useShallow` from `zustand/react/shallow` for multiple properties instead of destructuring `useStore()`.
