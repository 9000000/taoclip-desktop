import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeProject } from './src/renderer/project-model.js'
import { buildTimelinePlan, mapSourceRange, mapTimelineTime, toExportSegments } from './src/renderer/timeline-plan.js'
const require = createRequire(import.meta.url)
const ffmpegOps = require('./electron/ffmpeg-ops.cjs')
const projectStore = require('./electron/project-store.cjs')

let id = 0
const makeId = (kind) => `${kind}_${++id}`
const legacy = normalizeProject({ version: 1, clips: [{ path: 'C:/media/a.mp4', in: 2, out: 6, speed: 2 }],
  bgAudio: { kind: 'tts', path: 'C:/voice.wav', name: 'voice' }, bgVolume: 0.7,
  captions: [{ start: 3, end: 4, text: 'hello' }] }, makeId)
assert.equal(legacy.version, 3)
assert.equal(legacy.captionTimebase, 'source-legacy')
assert.equal(legacy.voice.path, 'C:/voice.wav')
assert.equal(legacy.clips[0].id, 'clip_1')
assert.equal(legacy.captions[0].id, 'caption_2')
assert.equal(legacy.clips[0].speed, 2)

const two = normalizeProject({ version: 2, clips: [
  { id: 'a', path: 'a.mp4', in: 0, out: 3 },
  { id: 'b', path: 'b.mp4', in: 1, out: 5, speed: 2 }
], transition: 'cross' }, makeId)
assert.equal(two.captionTimebase, 'timeline-legacy')
const plan = buildTimelinePlan(two.clips, { transition: 'cross', transitionDuration: 0.5 })
assert.equal(plan.entries[1].start, 2.5)
assert.equal(plan.duration, 4.5) // B plays 2s, so 3s - overlap 0.5 + 2s.
assert.deepEqual(mapSourceRange(plan, 'b', 3, 5).map(({ start, end }) => [start, end]), [[3.5, 4.5]])
assert.deepEqual(mapTimelineTime(plan, 2.75).map((entry) => entry.clipId), ['a', 'b'])
assert.equal(toExportSegments(plan).length, 2)

const cut = buildTimelinePlan([{ id: 'c', path: 'c.mp4', in: 0, out: 6, speed: 1 }], {
  keepByClip: { c: [{ start: 0, end: 2 }, { start: 4, end: 6 }] }
})
assert.equal(cut.duration, 4)
assert.deepEqual(mapSourceRange(cut, 'c', 4.5, 5).map(({ start, end }) => [start, end]), [[2.5, 3]])

assert.throws(() => normalizeProject({ version: 99, clips: [] }), /mới hơn/)
assert.throws(() => normalizeProject({ version: 3, clips: [{ path: '', in: 0, out: 2 }] }), /clips\[0\]\.path/)
assert.throws(() => buildTimelinePlan([{ id: 'bad', in: 1, out: 1 }]), /không hợp lệ/)
assert.equal(buildTimelinePlan([{ id: 'silent', in: 0, out: 3 }], { keepByClip: { silent: [] } }).duration, 0)
const noSecrets = normalizeProject({ version: 3, projectId: 'safe', clips: [], googleTtsKey: 'do-not-save', apiKey: 'do-not-save' }, makeId)
assert.equal('googleTtsKey' in noSecrets, false)
assert.equal('apiKey' in noSecrets, false)

const jobA = ffmpegOps.beginJob('unit-job-a')
const jobB = ffmpegOps.beginJob('unit-job-b')
let releaseJobs
const jobsGate = new Promise((resolve) => { releaseJobs = resolve })
const stateA = ffmpegOps.runJob(jobA, async () => { await jobsGate; return ffmpegOps.isCancelled() })
const stateB = ffmpegOps.runJob(jobB, async () => { await jobsGate; return ffmpegOps.isCancelled() })
assert.equal(ffmpegOps.cancelJob('unit-job-a'), true)
releaseJobs()
assert.deepEqual(await Promise.all([stateA, stateB]), [true, false])
ffmpegOps.endJob('unit-job-a')
ffmpegOps.endJob('unit-job-b')
const encoderA = ffmpegOps.runJob(ffmpegOps.beginJob('unit-encoder-a'), async () => {
  ffmpegOps.setEncoder('nvenc')
  return ffmpegOps.getEncoder()
})
const encoderB = ffmpegOps.runJob(ffmpegOps.beginJob('unit-encoder-b'), async () => ffmpegOps.getEncoder())
assert.deepEqual(await Promise.all([encoderA, encoderB]), ['nvenc', 'cpu'])
ffmpegOps.endJob('unit-encoder-a')
ffmpegOps.endJob('unit-encoder-b')

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-project-store-'))
try {
  const storeFile = path.join(storeDir, 'sample.taoclip')
  projectStore.writeProject(storeFile, { version: 3, clips: [{ id: 'one' }] })
  assert.deepEqual(projectStore.readProject(storeFile), { version: 3, clips: [{ id: 'one' }] })
  projectStore.writeProject(storeFile, { version: 3, clips: [{ id: 'two' }] })
  assert.deepEqual(projectStore.readProject(storeFile), { version: 3, clips: [{ id: 'two' }] })
  const backupFile = `${storeFile}.bak`
  fs.renameSync(storeFile, backupFile)
  assert.deepEqual(projectStore.readProject(storeFile), { version: 3, clips: [{ id: 'two' }] })
  assert.equal(fs.existsSync(backupFile), false)
  assert.throws(() => projectStore.writeProject(storeFile, { text: 'x'.repeat(projectStore.MAX_PROJECT_BYTES) }), /25 MB/)
  assert.deepEqual(projectStore.readProject(storeFile), { version: 3, clips: [{ id: 'two' }] })
} finally {
  const safeTempRoot = path.resolve(os.tmpdir()) + path.sep
  assert.ok(path.resolve(storeDir).startsWith(safeTempRoot), 'test cleanup must stay inside the OS temp directory')
  fs.rmSync(storeDir, { recursive: true, force: true })
}
console.log('Project schema, timeline plan, isolated jobs and safe project store: PASS')
