## 2026-03-13 - SQL Security Blocklist Bypass in sql-node

**Vulnerability:** `sql-node/index.js` used a blocklist regex (`INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|MERGE`) to block dangerous SQL. This approach is fundamentally incomplete — it omits dangerous operations like `CREATE`, `GRANT`, `REVOKE`, `LOAD DATA INFILE` (MySQL file read), `COPY TO/FROM` (PostgreSQL file read/write), `INTO OUTFILE`, `CALL`, and `SET`. An attacker could pass any of these to bypass the security check while the error message still claimed "Solo SELECT consentite."

**Learning:** Blocklists for SQL safety are inherently fragile — every new SQL keyword or DB-specific feature is a potential bypass. The intended policy was SELECT-only, but the blocklist implementation didn't match that policy. This mismatch between intent and implementation is a common source of security gaps.

**Prevention:** Always use an allowlist (whitelist) to enforce read-only SQL access: `!/^\s*SELECT\b/i.test(query)`. This matches the stated policy exactly and is resilient to new/exotic SQL keywords.
