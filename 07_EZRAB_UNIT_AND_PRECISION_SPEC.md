# Unit and Precision Specification

Unit conversion is explicit and auditable. Dimension canonicalization normally uses metres; area/volume conversions are derived by dimensional exponent, never by string replacement. Supported user units: `mm, cm, m, m2, m3, kg, ton, bh, unit, set, liter, sak, batang`.

Calculation precision is distinct from display precision. No intermediate rounding unless the referenced formula explicitly rounds. Use `decimal.js` (already installed) or an equivalent configured decimal policy; native `SafeDecimalEngine` is legacy because it scales operands differently and rounds intermediate values.

Each policy defines scale, rounding mode, currency scale, and serialization. `Math.round/ceil/floor/toFixed` are forbidden in formula definitions unless represented as a named, sourced rounding operation. Compare raw Excel evaluated values at configured tolerance; display formatting happens only at UI/export boundary.

Audit database numeric types, JSON serialization, and export formatting separately. Preserve zero, reject invalid/negative values according to calculator semantics, and never use fallback defaults for missing required inputs.