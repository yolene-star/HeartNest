import fs from 'node:fs/promises'
const before = {}
for (const path of ['diaries', 'profile']) {
  const response = await fetch(`http://127.0.0.1:8080/api/${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  before[path] = (await response.json()).items.map(item => item.id).sort()
}
await fs.mkdir(new URL('../../docs/completion-validation/', import.meta.url), { recursive: true })
await fs.writeFile(new URL('../../docs/completion-validation/default-before.json', import.meta.url), JSON.stringify(before, null, 2))
console.log(`Snapshot: ${before.diaries.length} diaries, ${before.profile.length} profiles; only IDs saved`)
