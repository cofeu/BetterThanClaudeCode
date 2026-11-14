import test from "node:test"
import assert from "node:assert/strict"

import { createCache } from "../cache.js"

test("caches sequential loads", async () => {
  let calls = 0
  const cache = createCache(async (key) => {
    calls++
    return key.toUpperCase()
  })

  assert.equal(await cache.get("a"), "A")
  assert.equal(await cache.get("a"), "A")
  assert.equal(calls, 1)
})

test("keeps keys separate", async () => {
  let calls = 0
  const cache = createCache(async (key) => {
    calls++
    return key.toUpperCase()
  })

  assert.equal(await cache.get("a"), "A")
  assert.equal(await cache.get("b"), "B")
  assert.equal(calls, 2)
})
