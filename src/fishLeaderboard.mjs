// Replay one species in input order, starting with an empty ten-slot leaderboard.
export function leaderboardAnnouncements(catches) {
  const top = []
  const announcements = []
  for (const size of catches) {
    if (!Number.isFinite(size)) continue
    // Once full, a tie with the smallest entry does not change the leaderboard.
    if (top.length === 10 && size <= top[9]) continue

    announcements.push(size)
    const position = top.findIndex(entry => size > entry)
    if (position === -1) top.push(size)
    else top.splice(position, 0, size)
    if (top.length > 10) top.pop()
  }
  return announcements
}
