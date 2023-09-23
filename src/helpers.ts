import * as os from 'node:os'

export async function getSystemStats() {
  const [cpu, memory] = await Promise.all([getCPUUsage(), getMemoryUsage()])
  return { cpu, memory }
}

function getCPUInfo() {
  const cpus = os.cpus()
  return cpus.reduce((acc, cpu) => {
    acc.idle += cpu.times.idle
    acc.total += cpu.times.idle + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq
    return acc
  }, { idle: 0, total: 0 })
}

async function getCPUUsage() {
  const cpuStart = getCPUInfo()
  const cpuEnd = await new Promise<{
    total: number,
    idle: number
  }>((resolve, reject) => {
    setTimeout(() => {
      resolve(getCPUInfo())
    }, 1000)
  })

  const idle = cpuEnd.idle - cpuStart.idle
  const total = cpuEnd.total - cpuStart.total
  return 1 - idle / total
}

async function getMemoryUsage() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free

  return 1 - (free / total)
}