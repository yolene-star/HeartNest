// Tests mutate an isolated database, so run them sequentially, never in parallel.
for (const name of ['diary-selection', 'nature-product', 'completion', 'mood-timeline', 'chat-memory']) {
  await import(`./${name}.mjs`)
  if (process.exitCode) throw new Error(`Stopped after failed regression: ${name}`)
}
console.log('PASS all five sequential browser regression suites')
