// Preload for one-off scripts compiled with tsc into .scripts-build: tsc does
// not rewrite the `@/` path alias on emit, so map it at require time.
//   node -r ./scripts/alias.cjs .scripts-build/scripts/<script>.js
const Module = require('node:module')
const path = require('node:path')
const root = path.resolve(__dirname, '..', '.scripts-build')
const original = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    return original.call(this, path.join(root, request.slice(2)), ...rest)
  }
  return original.call(this, request, ...rest)
}
