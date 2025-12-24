#!/usr/bin/env bun

/**
 * Release script for nanogpt-code
 * 
 * Usage: bun run script/release.ts <version>
 * Example: bun run script/release.ts 1.0.196
 */

import { $ } from "bun"
import path from "path"
import fs from "fs"

const version = process.argv[2]

if (!version) {
    console.error("Usage: bun run script/release.ts <version>")
    console.error("Example: bun run script/release.ts 1.0.196")
    process.exit(1)
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error("Invalid version format. Use semver: X.Y.Z")
    process.exit(1)
}

const dir = path.resolve(import.meta.dir, "..")
process.chdir(dir)

console.log(`\n🚀 Releasing nanogpt-code v${version}\n`)

// Platform binaries to publish
const platforms = [
    "nanogpt-code-linux-x64",
    "nanogpt-code-linux-arm64",
    "nanogpt-code-darwin-x64",
    "nanogpt-code-darwin-arm64",
    "nanogpt-code-windows-x64",
]

// Step 1: Update package.json version
console.log("📝 Updating package.json version...")
const pkgPath = path.join(dir, "package.json")
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
pkg.version = version
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

// Step 2: Build all platforms
console.log("\n🔨 Building all platforms...")
await $`bun run build`

// Step 3: Create dist/package.json for npm publish
console.log("\n📦 Creating publishable package.json...")
const distPkg = {
    name: "nanogpt-code",
    version,
    description: "AI-powered coding agent using NanoGPT",
    author: "0xGingi",
    license: "MIT",
    repository: {
        type: "git",
        url: "https://github.com/0xGingi/opencode"
    },
    homepage: "https://nano-gpt.com",
    keywords: ["ai", "coding", "agent", "nanogpt", "cli", "llm"],
    bin: {
        nanogpt: "./bin/nanogpt"
    },
    optionalDependencies: Object.fromEntries(
        platforms.map(p => [p, version])
    )
}
fs.writeFileSync(path.join(dir, "dist/package.json"), JSON.stringify(distPkg, null, 2) + "\n")

// Step 4: Copy bin folder to dist
console.log("📁 Copying bin folder...")
await $`cp -r bin dist/`

// Step 5: Update platform package.json versions
console.log("📝 Updating platform package versions...")
for (const platform of platforms) {
    const platformPkgPath = path.join(dir, "dist", platform, "package.json")
    if (fs.existsSync(platformPkgPath)) {
        const platformPkg = JSON.parse(fs.readFileSync(platformPkgPath, "utf-8"))
        platformPkg.version = version
        fs.writeFileSync(platformPkgPath, JSON.stringify(platformPkg, null, 2) + "\n")
    }
}

// Step 6: Publish platform binaries
console.log("\n📤 Publishing platform binaries to npm...")
console.log("   (You may need to authenticate in browser)\n")

for (const platform of platforms) {
    const platformDir = path.join(dir, "dist", platform)
    if (fs.existsSync(platformDir)) {
        console.log(`   Publishing ${platform}...`)
        try {
            await $`cd ${platformDir} && npm publish --access public`.quiet()
            console.log(`   ✅ ${platform}@${version} published`)
        } catch (e: any) {
            if (e.stderr?.includes("EPUBLISHCONFLICT") || e.message?.includes("already exists")) {
                console.log(`   ⏭️  ${platform}@${version} already exists, skipping`)
            } else {
                console.error(`   ❌ Failed to publish ${platform}:`, e.message)
            }
        }
    }
}

// Step 7: Publish main package
console.log("\n📤 Publishing main package...")
try {
    await $`cd ${path.join(dir, "dist")} && npm publish --access public`.quiet()
    console.log(`✅ nanogpt-code@${version} published!`)
} catch (e: any) {
    if (e.stderr?.includes("EPUBLISHCONFLICT") || e.message?.includes("already exists")) {
        console.log(`⏭️  nanogpt-code@${version} already exists`)
    } else {
        console.error("❌ Failed to publish main package:", e.message)
    }
}

console.log(`
✨ Release complete!

Install with:
  npm i -g nanogpt-code@${version}
  # or
  bun i -g nanogpt-code@${version}
`)
