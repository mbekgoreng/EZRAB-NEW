# Phase 1.1 Tolerance Policy

* Exact match is required for discrete counts and normalized unit labels.
* Numeric tolerance is only applied after comparing unrounded calculation values and documenting the source precision. Default proposal: `0` for exact decimal/reference values; otherwise `max(1e-9, 0.5 * 10^-scale)` where `scale` is explicitly sourced from Excel number format or policy.
* Display match is not parity: formatted strings are compared separately from numeric values.
* No tolerance can upgrade a missing Excel evaluated value to VERIFIED.