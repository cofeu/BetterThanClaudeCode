import test from "node:test"
import assert from "node:assert/strict"

import { paginate } from "../paginate.js"

const numbers = Array.from({ length: 25 }, (_, index) => index + 1)

test("defaults to the first 10 items", () => {
  const page = paginate(numbers)
  assert.deepEqual(page.data, numbers.slice(0, 10))
  assert.equal(page.total, 25)
  assert.equal(page.limit, 10)
  assert.equal(page.offset, 0)
})

test("applies limit and offset", () => {
  const page = paginate(numbers, { limit: 5, offset: 5 })
  assert.deepEqual(page.data, [6, 7, 8, 9, 10])
  assert.equal(page.limit, 5)
  assert.equal(page.offset, 5)
})

test("reports the full total, not the page size", () => {
  const page = paginate(numbers, { limit: 3, offset: 20 })
  assert.equal(page.data.length, 3)
  assert.equal(page.total, 25)
})

test("handles an empty list", () => {
  const page = paginate([])
  assert.deepEqual(page.data, [])
  assert.equal(page.total, 0)
})
