import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"
import { MigrationJournal } from "../../src/storage/migrations"

function time(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

describe("MigrationJournal", () => {
  test("matches migration sql files", () => {
    const dir = path.join(import.meta.dir, "../../migration")
    const journal = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        timestamp: time(entry.name),
        sql: readFileSync(path.join(dir, entry.name, "migration.sql"), "utf-8"),
      }))
      .sort((a, b) => a.timestamp - b.timestamp)

    expect(MigrationJournal).toEqual(journal)
  })
})
