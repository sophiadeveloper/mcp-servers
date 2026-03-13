## 2025-05-15 - Robust SQL Validation
**Vulnerability:** Weak regex-based SQL validation for query restrictions (e.g., blocking non-SELECT queries).
**Learning:** Simple regex checks for keywords like `INSERT`, `DELETE` can be easily bypassed using SQL comments (e.g., `DE/**/LETE`) or multi-statement queries. Additionally, they often produce false positives by matching keywords inside string literals (e.g., `WHERE col LIKE '%insert%'`).
**Prevention:** Always sanitize the query by removing string literals and SQL comments before performing keyword-based validation. Use word boundaries (`\b`) in regex to match exact keywords and maintain a comprehensive list of dangerous operations.
