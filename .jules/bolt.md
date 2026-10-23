## 2024-05-24 - Prevent Re-renders with useShallow
**Learning:** Components were re-rendering massively because properties like `elapsedTime` in the global state tick every second, and components were subscribing to the entire state by destructuring the result of `useStore()`.
**Action:** When using Zustand's `useStore`, always use `useShallow` from `zustand/react/shallow` or pick specific states if destructuring is used, e.g., `const { a, b } = useStore(useShallow(state => ({ a: state.a, b: state.b })))`.
