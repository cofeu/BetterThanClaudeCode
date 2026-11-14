import test from "node:test"
import assert from "node:assert/strict"

import { paginate } from "../paginate.js"

const numbers = Array.from({ length: 250 }, (_, index) => index + 1)

test("rejects a limit below 1", () => {
  assert.throws(() => paginate(numbers, { limit: 0 }), RangeError)
})

test("rejects a limit above 100", () => {
  assert.throws(() => paginate(numbers, { limit: 101 }), RangeError)
})

test("rejects a non-integer limit", () => {
  assert.throws(() => paginate(numbers, { limit: 1.5 }), RangeError)
  assert.throws(() => paginate(numbers, { limit: "5" }), RangeError)
})

test("rejects a negative offset", () => {
  assert.throws(() => paginate(numbers, { offset: -1 }), RangeError)
})

test("rejects a non-integer offset", () => {
  assert.throws(() => paginate(numbers, { offset: 1.5 }), RangeError)
})

test("accepts the boundary values", () => {
  const page = paginate(numbers, { limit: 100, offset: 0 })
  assert.equal(page.data.length, 100)
  assert.equal(page.limit, 100)
})

test("returns an empty page when the offset is past the end", () => {
  const page = paginate(numbers, { limit: 10, offset: 1000 })
  assert.deepEqual(page.data, [])
  assert.equal(page.total, 250)
})

test("rejects a non-array items argument", () => {
  assert.throws(() => paginate("abc"), TypeError)
  assert.throws(() => paginate({ length: 3 }), TypeError)
})

test("does not mutate the input array", () => {
  const input = [1, 2, 3, 4]
  paginate(input, { limit: 2, offset: 1 })
  assert.deepEqual(input, [1, 2, 3, 4])
})
