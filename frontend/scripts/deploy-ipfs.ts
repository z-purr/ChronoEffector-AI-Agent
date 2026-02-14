import { execSync } from "child_process"
import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative, dirname } from "path"
import { fileURLToPath } from "url"
import * as contentHash from "@ensdomains/content-hash"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const DIST = join(ROOT, "dist")
const ALEPH_GATEWAY = "https://ipfs-2.aleph.im"

function collectFiles(dir: string, base: string = dir): { path: string; full: string }[] {
  const entries: { path: string; full: string }[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isFile()) {
      entries.push({ path: relative(base, full), full })
    } else if (statSync(full).isDirectory()) {
      entries.push(...collectFiles(full, base))
    }
  }
  return entries
}

async function uploadToIPFS(distDir: string): Promise<string> {
  const files = collectFiles(distDir)
  const formData = new FormData()
  for (const f of files) {
    const blob = new Blob([readFileSync(f.full)])
    formData.append("file", blob, f.path)
  }

  const url = `${ALEPH_GATEWAY}/api/v0/add?recursive=true&wrap-with-directory=true`
  const res = await fetch(url, { method: "POST", body: formData })
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.status}`)

  const text = await res.text()
  let cidV0: string | undefined
  for (const line of text.trim().split("\n")) {
    const entry = JSON.parse(line)
    cidV0 = entry.Hash
  }
  if (!cidV0) throw new Error("No CID in response")
  return cidV0
}

async function main() {
  console.log("Building frontend...")
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" })

  console.log("\nUploading to IPFS via Aleph...")
  const cidV0 = await uploadToIPFS(DIST)

  // Encode to EIP-1577 content hash
  const encoded = contentHash.encode("ipfs", cidV0)
  const contentHashHex = `0x${encoded}`

  console.log("\n" + "=".repeat(60))
  console.log("IPFS DEPLOYMENT COMPLETE")
  console.log("=".repeat(60))
  console.log(`\nCID (v0):         ${cidV0}`)
  console.log(`Gateway URL:      https://ipfs.aleph.im/ipfs/${cidV0}`)
  console.log(`\nContent hash hex: ${contentHashHex}`)
  console.log(`\nFor L1 (manual):  Set content hash on basileus-agent.eth to the hex above`)
  console.log(`For L2 (CLI):     Pass the content hash hex to the basileus CLI`)
  console.log("=".repeat(60))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
