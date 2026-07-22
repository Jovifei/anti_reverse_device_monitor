import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import nextVitals from 'eslint-config-next/core-web-vitals.js'

const baseDirectory = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory })

const config = [
  ...compat.config(nextVitals),
  { ignores: ['.next/**', '.next-validation/**', '.next-ui-capture-*/**', 'coverage/**', 'data/**', 'node_modules/**', 'prototype/**'] }
]

export default config
