import os from 'os'
import { memoryUsage, cpuUsage } from 'node:process'

const ncpu = os.cpus().length
let previousTime = new Date().getTime()
let previousUsage = process.cpuUsage()
let lastUsage: { user: number; system: number; total: number } = { user: 0, system: 0, total: 0 }

setInterval(() => {
  const currentUsage = process.cpuUsage(previousUsage)

  previousUsage = process.cpuUsage()

  // we can't do simply time / 10000 / ncpu because we can't trust
  // setInterval is executed exactly every 1.000.000 microseconds
  const currentTime = new Date().getTime()
  // times from process.cpuUsage are in microseconds while delta time in milliseconds
  // * 10 to have the value in percentage for only one cpu
  // * ncpu to have the percentage for all cpus af the host

  // this should match top's %CPU
  const timeDelta = (currentTime - previousTime) * 10 * ncpu
  // this would take care of CPUs number of the host
  // const timeDelta = (currentTime - previousTime) * 10 * ncpu;
  const { user, system } = currentUsage

  lastUsage = { system: system / timeDelta, total: (system + user) / timeDelta, user: user / timeDelta }
  previousTime = currentTime
}, 1000)

export function getCpuUsage() {
  return lastUsage.total
}

export function getMemoryUsage() {
  const total = os.totalmem() - (200 * 1024 * 1024)
  const used = memoryUsage.rss()
  return used / total
}
