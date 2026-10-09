#!/bin/bash
# Runner: bundle actual TS implementation and run tests
cd ~/workspace/ezrab-integrasi
npx esbuild src/test/dedQuantitySafety.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/dedq.cjs --log-level=error && node /tmp/dedq.cjs
