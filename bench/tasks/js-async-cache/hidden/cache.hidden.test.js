import test from "node:test"
import assert from "node:assert/strict"

import { createCache } from "../cache.js"

test("deduplicates concurrent loads for one key", async () => {
  let calls = 0
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })

  const cache = createCache(async (key) => {
    calls++
    await gate
    return `${key}!`
  })

  const first = cache.get("a")
  const second = cache.get("a")
  const third = cache.get("a")

  await Promise.resolve()
  assert.equal(calls, 1)

  release()
  assert.deepEqual(await Promise.all([first, second, third]), ["a!", "a!", "a!"])
})

test("does not cache a rejection", async () => {
  let calls = 0
  let shouldFail = true
  const cache = createCache(async (key) => {
    calls++
    if (shouldFail) throw new Error("boom")
    return `${key}!`
  })

  await assert.rejects(cache.get("x"), /boom/)
  shouldFail = false
  assert.equal(await cache.get("x"), "x!")
  assert.equal(calls, 2)
})

test("loads different keys independently", async () => {
  let calls = 0
  const cache = createCache(async (key) => {
    calls++
    return key.toUpperCase()
  })

  const [a, b] = await Promise.all([cache.get("a"), cache.get("b")])
  assert.equal(a, "A")
  assert.equal(b, "B")
  assert.equal(calls, 2)
})
