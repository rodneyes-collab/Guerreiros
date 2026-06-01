#!/bin/bash
set -e
echo "Starting build..."
rm -rf dist
mkdir -p dist
npx vite build
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
echo "Build finished. Files in dist:"
ls -la dist
