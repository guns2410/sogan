import * as os from 'os'

type Task = () => Promise<any>;

export type QueueOptions = {
  maxConcurrency: number
  maxCpuUsage: number
  maxMemoryUsage: number
  initialConcurrency: number
}

export class Queue {
  private cpuThreshold: number
  private memoryThreshold: number
  private concurrency: number
  private maxConcurrency: number
  private queue: Task[]
  private running: number
  private interval: NodeJS.Timeout | null
  private checkInterval: number = 10000

  constructor(opts: Partial<QueueOptions> = {}) {
    this.cpuThreshold = opts.maxCpuUsage || 0.8
    this.memoryThreshold = opts.maxMemoryUsage || 0.8
    this.concurrency = opts.initialConcurrency || 1
    this.maxConcurrency = opts.maxConcurrency || Infinity
    this.queue = []
    this.running = 0
    this.interval = null
    this.startSystemStatsCheck(this.checkInterval)
  }

  get currentConcurrency(): number {
    return this.concurrency
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // Push a new Task into the Queue
  async enqueue(task: Task): Promise<{ promise: () => Promise<any> }> {
    if (this.running >= this.concurrency) {
      await this.sleep(100)
      return this.enqueue(task)
    }
    const promise = () => new Promise((resolve, reject) => {
      task()
        .then(resolve)
        .catch(reject)
    }).finally(() => { this.next() })
    this.queue.push(promise)
    this.next()
    return { promise }
  }

  async done() {
    await new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.queue.length === 0 && this.running === 0) {
          clearInterval(interval)
          resolve(true)
        }
      }, 100)
    })
  }

  // Run the next Task
  private next(): void {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return
    }

    this.running++
    const task = this.queue.shift()
    if (task) {
      task()
        .then(() => {
          this.running--
          this.next()
        })
        .catch((err) => {
          this.running--
          this.next()
        })
    }
    this.next()
  }

  // Function to check system stats and adjust concurrency
  private checkSystemStats(): void {
    const freeMemPercentage = (os.freemem() / os.totalmem())
    const cpuUsage = (os.loadavg()[0] / os.cpus().length) // 1 minute load average
    const memFactor = freeMemPercentage > this.memoryThreshold ? ((freeMemPercentage - this.memoryThreshold) / 100) : 0
    const cpuFactor = cpuUsage < this.cpuThreshold ? ((this.cpuThreshold - cpuUsage) / this.cpuThreshold) : 0
    const increaseFactor = Math.min(memFactor, cpuFactor)
    const decreaseFactor = 1 - increaseFactor;

    if (increaseFactor > 0) {
        this.concurrency = Math.ceil(this.concurrency * (1 + increaseFactor));
    } else if (decreaseFactor > 0) {
        this.concurrency = Math.max(1, Math.floor(this.concurrency * (1 - decreaseFactor)));
    }
  }

  // Function to start system stats check in intervals
  startSystemStatsCheck(interval: number): void {
    if (this.interval) {
      clearInterval(this.interval)
    }
    this.interval = setInterval(() => {
      this.checkSystemStats()
      this.next()  // Trigger the queue processing after adjusting the concurrency
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
