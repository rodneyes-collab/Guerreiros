## 2025-02-28 - Unnecessary Zustand Rerenders from Root
**Learning:** In Zustand with React, subscribing to frequently changing state like a timer `elapsedTime` at the root/App level causes cascading re-renders of the entire application on every tick, even if the value isn't used for rendering.
**Action:** When working with Zustand, only select data (read via hooks) exactly where it is rendered. Do not read frequently updating primitives in root components unless absolutely necessary, or consider imperative reads (`useStore.getState().elapsedTime`).
