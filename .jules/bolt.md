## 2023-10-27 - React.memo Optimization Strategy
**Learning:** Wrapped frequently used `PlayerAvatar` component with `React.memo` to avoid unnecessary re-renders in list views. It is used in 26 places in the project, particularly heavily in `MembersView` and `RankingView`.
**Action:** Proceed with applying `React.memo` on `PlayerAvatar` component using merge diffs.
