const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAX_PROJECT_BYTES = 25 * 1024 * 1024

function recoverBackup(target, backup) {
  if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target)
}

function writeProject(targetPath, project) {
  const target = path.resolve(targetPath)
  const dir = path.dirname(target)
  const backup = `${target}.bak`
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`
  const serialized = JSON.stringify(project, null, 2)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_BYTES) throw new Error('File dự án vượt quá giới hạn 25 MB.')
  fs.mkdirSync(dir, { recursive: true })

  recoverBackup(target, backup)
  if (fs.existsSync(backup)) fs.rmSync(backup, { force: true })
  try {
    const fd = fs.openSync(temp, 'wx')
    try {
      fs.writeFileSync(fd, serialized, 'utf8')
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
  } catch (error) {
    fs.rmSync(temp, { force: true })
    throw error
  }

  let movedOld = false
  try {
    if (fs.existsSync(target)) { fs.renameSync(target, backup); movedOld = true }
    fs.renameSync(temp, target)
    if (movedOld) fs.rmSync(backup, { force: true })
    return target
  } catch (error) {
    if (movedOld && !fs.existsSync(target) && fs.existsSync(backup)) {
      try { fs.renameSync(backup, target) } catch {}
    }
    throw error
  } finally { fs.rmSync(temp, { force: true }) }
}

function readProject(filePath) {
  const target = path.resolve(filePath)
  const backup = `${target}.bak`
  recoverBackup(target, backup)
  const stat = fs.statSync(target)
  if (stat.size > MAX_PROJECT_BYTES) throw new Error('File dự án vượt quá giới hạn 25 MB.')
  try { return JSON.parse(fs.readFileSync(target, 'utf8')) }
  catch (error) { throw new Error(`File dự án lỗi: ${error.message}`) }
}

module.exports = { MAX_PROJECT_BYTES, writeProject, readProject }
