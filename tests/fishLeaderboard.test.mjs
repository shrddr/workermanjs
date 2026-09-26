import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { leaderboardAnnouncements } from '../src/fishLeaderboard.mjs'

test('fills empty slots and retains only later top-ten updates', () => {
  const initial = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  const catches = [...initial, 0, 5, 1, 11, 2, 2.5, 3]
  const original = [...catches]
  assert.deepEqual(leaderboardAnnouncements(catches), [...initial, 5, 11])
  assert.deepEqual(catches, original)
})

test('uses chronological order rather than sorting before replay', () => {
  const ascending = Array.from({ length: 20 }, (_, i) => i + 1)
  const descending = [...ascending].reverse()
  assert.deepEqual(leaderboardAnnouncements(ascending), ascending)
  assert.deepEqual(leaderboardAnnouncements(descending), descending.slice(0, 10))
})

test('ties can fill slots, but do not update a full board at its cutoff', () => {
  assert.deepEqual(leaderboardAnnouncements(Array(20).fill(5)), Array(10).fill(5))
  assert.deepEqual(leaderboardAnnouncements([]), [])
  assert.deepEqual(leaderboardAnnouncements([NaN, 4, Infinity, 3]), [4, 3])
})

test('replays each species separately before combining its announcements', () => {
  const species = [
    Array.from({ length: 12 }, (_, i) => 100 - i),
    Array.from({ length: 12 }, (_, i) => 20 - i),
  ]
  const separate = species.flatMap(catches => leaderboardAnnouncements(catches))
  assert.equal(separate.length, 20)
  assert.equal(leaderboardAnnouncements(species.flat()).length, 10)
})

test('agrees with a full-sort reference replay', () => {
  const catches = Array.from({ length: 200 }, (_, i) => (i * 71 + i * i) % 113)
  const expected = []
  const seen = []
  for (const size of catches) {
    if (seen.length < 10 || size > seen[9]) expected.push(size)
    seen.push(size)
    seen.sort((a, b) => b - a)
  }
  assert.deepEqual(leaderboardAnnouncements(catches), expected)
})

test('retains the exact final top ten for every species in the real dataset', t => {
  const catchesByFish = JSON.parse(readFileSync(
    new URL('../data/manual/catches_by_fish.json', import.meta.url), 'utf8',
  ))
  let totalCatches = 0
  let totalAnnouncements = 0
  const counts = {}
  for (const [ik, catches] of Object.entries(catchesByFish)) {
    const announcements = leaderboardAnnouncements(catches)
    const topTen = values => [...values].sort((a, b) => b - a).slice(0, 10)
    assert.deepEqual(topTen(announcements), topTen(catches), `species ${ik}`)
    totalCatches += catches.length
    totalAnnouncements += announcements.length
    counts[ik] = announcements.length
  }
  t.diagnostic(`${totalCatches} catches -> ${totalAnnouncements} announcements`)
  t.diagnostic(`8257+8284: ${counts[8257] + counts[8284]} announcements`)
})
