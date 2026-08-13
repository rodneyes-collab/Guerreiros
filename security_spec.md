# Security Specification - Guerreiros Volleyball Club

## Data Invariants
1. A player cannot be created without a valid name and gender.
2. Only Admins can modify global metadata, matches, and tournaments.
3. Users can only modify their own player profile (some fields restricted).
4. Pending requests can be created by anyone (authenticated), but only viewed/modified by Admins.
5. Payments are strictly controlled by Admins.
6. Audit logs and login logs are append-only by the system or Admins.

## The Dirty Dozen Payloads

1. **Malicious Player Create**: Create a player with `isAdmin: true` as a non-admin.
2. **Identity Spoofing**: Update another player's ELO as a non-admin.
3. **Ghost Metadata**: Add a new document to `/metadata/` with arbitrary data.
4. **Illegal Match**: Create a match record with fake scores.
5. **PII Leak**: Read `/users/` collection to get all emails and roles.
6. **Payment Injection**: Create a `PAID` payment record for yourself without Admin approval.
7. **Bypass Pending**: Directly create a player profile without going through `pendingRequests`.
8. **Tournament Sabotage**: Delete an active tournament as a member.
9. **Attendance Fraud**: Mark someone else as present without being an Admin.
10. **ELO Poisoning**: Update own ELO to 9999.
11. **Log Erasure**: Delete audit logs to hide malicious activity.
12. **Status Shortcut**: Update a tournament status to 'completed' without finishing matches.

## Access Control Matrix

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `players` | SignedIn | Admin | Admin/Owner (limited) | Admin |
| `metadata` | SignedIn | Admin | Admin | Admin |
| `matches` | SignedIn | Admin | Admin | Admin |
| `attendance` | SignedIn | SignedIn (Self) | Admin | Admin |
| `tournaments` | SignedIn | Admin | Admin | Admin |
| `pendingRequests` | Admin | SignedIn | Admin | Admin |
| `payments` | Admin/Owner | Admin | Admin | Admin |
| `users` | Owner/Admin | SignedIn (Self) | Owner/Admin | Admin |
| `preConfirmations`| SignedIn | SignedIn (Self) | Admin | Admin |
| `auditLogs` | Admin | System/Admin | Admin | Admin |
| `loginLogs` | Admin | System | None | Admin |
| `sentinelReports` | Admin | System | None | Admin |
| `expenses` | Admin | Admin | Admin | Admin |
| `fcm_messages` | Admin | Admin | Admin | Admin |
