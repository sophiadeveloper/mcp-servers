## 2026-03-13 - SQL Security Blocklist Bypass in sql-node

**Vulnerability:** `sql-node/index.js` used a blocklist regex (`INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|MERGE`) to block dangerous SQL. This approach is fundamentally incomplete — it omits dangerous operations like `CREATE`, `GRANT`, `REVOKE`, `LOAD DATA INFILE` (MySQL file read), `COPY TO/FROM` (PostgreSQL file read/write), `INTO OUTFILE`, `CALL`, and `SET`. An attacker could pass any of these to bypass the security check while the error message still claimed "Solo SELECT consentite."

**Learning:** Blocklists for SQL safety are inherently fragile — every new SQL keyword or DB-specific feature is a potential bypass. The intended policy was SELECT-only, but the blocklist implementation didn't match that policy. This mismatch between intent and implementation is a common source of security gaps.

**Prevention:** Use an `isQueryReadOnly()` helper that:
1. **Strips all SQL comments** (`/* ... */` and `-- ...`) before keyword inspection — without this, a leading comment fools a simple prefix check. Note: nested block comments (PostgreSQL `/* /* ... */ */`) are not fully stripped, but in that edge case the first-keyword check still blocks the query safely.
2. **Allowlist first keyword & Body blocklist** — only `SELECT` and `WITH` (for CTEs) are permitted as starting verbs. To prevent data-modifying CTEs (e.g., `WITH x AS (DELETE...) SELECT * FROM x`), keywords like `INSERT`, `UPDATE`, `DELETE`, etc., are blocked in the entire query body.
3. **Blocks `INTO`** — catches `SELECT ... INTO OUTFILE/DUMPFILE` (MySQL filesystem write) and `SELECT INTO table` (PostgreSQL/MSSQL DDL). This is intentionally conservative: queries with `INTO` inside string literals are also blocked as a security-first tradeoff.
4. **Blocks non-terminal semicolons** — prevents multi-statement batch attacks like `SELECT 1; DROP TABLE users`.

Note: regex-level checks are a defence-in-depth measure. For maximum safety, the DB connection user should also be restricted to SELECT privileges at the database level.
