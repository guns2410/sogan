import { Task }         from './task'
import { EventEmitter } from 'events'
import { getSystemStats } from './helpers'

export type QueueOptions = {
  maxConcurrency: number
  maxCpuUsage: number
  maxMemoryUsage: number
  initialConcurrency: number
}

abstract class QueueEvents {
  static readonly PROCESS_TASK = 'process_task'
  static readonly CHECK_SYSTEM_STATS = 'check_system_stats'
  static running = 0

  static QueueEvents = [] as Array<Task<any>>

  static addEvent(event: Task<any>) {
    this.QueueEvents.push(event)
    this.QueueEvents.sort((a, b) => b.priority - a.priority)
  }

  static getNextEvent(): Task<any> | undefined {
    return this.QueueEvents.shift()
  }

  static getQueueLength(): number {
    return this.QueueEvents.length
  }

  static async processEvent(task: Task<any>) {
    if (!task) return

    this.running++
    await task.run()
    this.running--
  }

}

export class Queue extends EventEmitter {
  private readonly cpuThreshold: number
  private readonly memoryThreshold: number
  private concurrency: number
  private readonly maxConcurrency: number
  private interval: NodeJS.Timeout | null

  constructor(opts: Partial<QueueOptions> = {}) {
    super()
    this.cpuThreshold = opts.maxCpuUsage || 0.8
    this.memoryThreshold = opts.maxMemoryUsage || 0.8
    this.concurrency = opts.initialConcurrency || 1
    this.maxConcurrency = opts.maxConcurrency || Infinity
    this.interval = null

    this.waitUntilQueueIsReady = this.waitUntilQueueIsReady.bind(this)
    this.enqueue = this.enqueue.bind(this)
    this.done = this.done.bind(this)
    this.addToQueue = this.addToQueue.bind(this)
    this.next = this.next.bind(this)
    this.checkSystemStats = this.checkSystemStats.bind(this)
    this.startSystemStatsCheck = this.startSystemStatsCheck.bind(this)
    this.stopSystemStatsCheck = this.stopSystemStatsCheck.bind(this)
    this.sleep = this.sleep.bind(this)

    this.on(QueueEvents.CHECK_SYSTEM_STATS, async () => {
      await this.checkSystemStats()
    })

    this.on(QueueEvents.PROCESS_TASK, async () => {
      await this.next()
    })

    this.checkSystemStats().then(r => r)
  }

  get currentConcurrency(): number {
    return this.concurrency
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Push a new Task into the Queue
  async enqueue<ReturnValue>(fn: () => Promise<ReturnValue>, priority: number = 0, deadline: number | null = null): Promise<{
    result: Promise<ReturnValue>
  }> {
    await this.waitUntilQueueIsReady()

    const task = new Task<ReturnValue>({ fn, priority, deadline })
    this.addToQueue(task)

    return { result: task.promise }
  }

  async waitUntilQueueIsReady(): Promise<void> {
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (QueueEvents.getQueueLength() < this.concurrency) {
          clearInterval(interval)
          resolve(true)
        }
      }, 10)
    })
  }

  async done() {
    await new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (QueueEvents.getQueueLength() === 0 && QueueEvents.running === 0) {
          clearInterval(interval)
          resolve(true)
        }
      }, 100)
    })
  }

  private addToQueue<T>(task: Task<T>): void {
    QueueEvents.addEvent(task)
    this.emit(QueueEvents.PROCESS_TASK)
  }

  // Run the next Task
  private async next(): Promise<Promise<void> | void> {
    // console.info('Queue length:', QueueEvents.getQueueLength(), 'Running:', QueueEvents.running, 'Concurrency:', this.concurrency)
    if (QueueEvents.running >= this.concurrency) {
      return
    }

    const task = QueueEvents.getNextEvent()
    if (task) {
      await QueueEvents.processEvent(task)
      this.emit(QueueEvents.PROCESS_TASK)
    }
  }

  // Function to check system stats and adjust concurrency
  private async checkSystemStats(): Promise<void> {
    const currentConcurrency = this.concurrency
    const { cpu, memory } = await getSystemStats()
    const memFactor = memory < this.memoryThreshold ? (this.memoryThreshold - memory) : 0
    const cpuFactor = cpu < this.cpuThreshold ? ((this.cpuThreshold - cpu) / this.cpuThreshold) : 0
    const increaseFactor = Math.min(memFactor, cpuFactor)
    const decreaseFactor = 1 - increaseFactor

    if (increaseFactor > 0) {
      this.concurrency = Math.ceil(this.concurrency * (1 + increaseFactor))
    } else if (decreaseFactor > 0) {
      this.concurrency = Math.max(1, Math.floor(this.concurrency * (1 - decreaseFactor)))
    }

    if (this.concurrency > this.maxConcurrency) {
      this.concurrency = this.maxConcurrency
    }

    if (currentConcurrency !== this.concurrency) {
      this.emit('concurrency_change', this.concurrency)
    }

    // console.info(`System stats: CPU: ${cpu.toFixed(2)} / ${this.cpuThreshold.toFixed(2)} | Memory: ${memory.toFixed(2)} / ${this.memoryThreshold.toFixed(2)} | Concurrency: ${this.concurrency}`)
    this.sleep(1000).then(() => this.emit(QueueEvents.CHECK_SYSTEM_STATS))
    this.emit(QueueEvents.PROCESS_TASK)
  }

  // Function to start system stats check in intervals
  private startSystemStatsCheck(interval: number): void {
    if (this.interval) {
      clearInterval(this.interval)
    }
    this.interval = setInterval(async () => {
      // console.info('Checking system stats...')
      await this.checkSystemStats()
    }, interval)
  }

  // Function to stop system stats check
  stopSystemStatsCheck(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
