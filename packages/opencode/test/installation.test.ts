import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Installation } from "../src/installation"
import fs from "fs"
import path from "path"
import os from "os"

describe("Installation", () => {
  const markerPath = path.join(os.homedir(), ".config", "nanocode", "install-method")

  afterEach(async () => {
    try {
      await fs.promises.unlink(markerPath)
    } catch {}
  })

  describe("writeInstallMethodMarker and readInstallMethodMarker", () => {
    test("should write and read marker file", async () => {
      await Installation.writeInstallMethodMarker("gh-release")
      const method = await Installation.method()
      expect(method).toBe("gh-release")
    })

    test("should create directory if it doesn't exist", async () => {
      const testPath = path.join(os.homedir(), ".config", "nanocode")
      await fs.promises.rm(testPath, { recursive: true, force: true })

      await Installation.writeInstallMethodMarker("npm")
      const content = await fs.promises.readFile(markerPath, "utf-8")
      expect(content.trim()).toBe("npm")
    })
  })

  describe("method detection", () => {
    test("should detect gh-release from marker", async () => {
      await Installation.writeInstallMethodMarker("gh-release")
      const method = await Installation.method()
      expect(method).toBe("gh-release")
    })
  })

  describe("latest version", () => {
    test("should fetch latest version from GitHub", async () => {
      const version = await Installation.latest("gh-release")
      expect(version).toMatch(/^\d+\.\d+\.\d+/)
    })
  })
})
