import { EventEmitter } from 'events'
import { getCpuUsage, getMemoryUsage } from './helpers'

export type QueueOptions = {
  maxConcurrency: number
  maxCpuUsage: number
  maxMemoryUsage: number
  initialConcurrency: number
}


export class Queue extends EventEmitter {
  private _queue: Array<{ cb: () => Promise<unknown>, resolve: (data: unknown) => void, reject: (err: Error) => void }> = []
  private pending: Array<{ cb: () => Promise<unknown>, resolve: (data: unknown) => void, reject: (err: Error) => void }> = []
  private _isProcessing = false
  private _isPaused = false
  private readonly options: QueueOptions
  private currentCpuUsage: number
  private currentMemoryUsage: number
  private concurrency: number
  private iterations: number = 0

  constructor(opts: Partial<QueueOptions> = {}) {
    super()
    this.options = {
      maxCpuUsage: 0.8,
      maxMemoryUsage: 0.8,
      initialConcurrency: 1,
      maxConcurrency: Infinity,
      ...opts,
    } as QueueOptions
    this.currentCpuUsage = getCpuUsage()
    this.currentMemoryUsage = getMemoryUsage()
    this.concurrency = this.options.initialConcurrency
    this.on('process', this.onProcess.bind(this))
  }

  private refactorConcurrency(): number {
    if (this.iterations % 5 === 0) {
      const memoryUsageDiff = this.memoryUsageDiff
      const cpuUsageDiff = this.cpuUsageDiff
      const { maxConcurrency, maxMemoryUsage, maxCpuUsage } = this.options
      if (this.memoryUsage >= maxMemoryUsage * 0.9 || this.cpuUsage >= maxCpuUsage * 0.9) {
        this.concurrency = Math.max(this.concurrency - 1, 1)
        return this.concurrency
      }

      if (this.concurrency >= maxConcurrency) {
        this.concurrency = maxConcurrency
        return this.concurrency
      }

      if (memoryUsageDiff <= 0) {
        this.concurrency = Math.min(this.concurrency + 2, maxConcurrency)
      }

      if (cpuUsageDiff <= 0) {
        this.concurrency = Math.min(this.concurrency + 2, maxConcurrency)
      }

      if (memoryUsageDiff <= 0.1) {
        this.concurrency = Math.min(this.concurrency + 1, maxConcurrency)
      }

      if (cpuUsageDiff <= 0.1) {
        this.concurrency = Math.min(this.concurrency + 1, maxConcurrency)
      }
    }
    return this.concurrency

  }

  get cpuUsage() {
    return getCpuUsage()
  }

  get memoryUsage() {
    return getMemoryUsage()
  }

  get cpuUsageDiff() {
    const prevCpuUsage = this.currentCpuUsage
    this.currentCpuUsage = getCpuUsage()
    return this.currentCpuUsage - prevCpuUsage
  }

  get memoryUsageDiff() {
    const prevMemoryUsage = this.currentMemoryUsage
    this.currentMemoryUsage = getMemoryUsage()
    return this.currentMemoryUsage - prevMemoryUsage
  }

  get length() {
    return this._queue.length
  }

  get isProcessing() {
    return this._isProcessing
  }

  get isPaused() {
    return this._isPaused
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async waitUntilReady(): Promise<boolean> {
    if (this._queue.length === 0 || this.pending.length < this.concurrency) {
      return true
    }
    await this.sleep(100)
    return this.waitUntilReady()
  }

  async done() {
    while (this._queue.length > 0 || this.pending.length > 0) {
      await this.sleep(100)
    }
  }

  async enqueue(cb: () => Promise<unknown>): Promise<{ promise: Promise<unknown> }> {
    await this.waitUntilReady()
    const promise = new Promise((resolve, reject) => {
      this._queue.push({ cb, resolve, reject })
      this.emit('added')
      this._processQueue()
    })
    return { promise }
  }

  private dequeue() {
    return this._queue.shift()
  }

  pause() {
    this._isPaused = true
  }

  resume() {
    this._isPaused = false
    this._processQueue()
  }

  clear() {
    this._queue = []
  }

  onProcess(item: { cb: () => Promise<unknown>, resolve: (data: unknown) => void, reject: (err: Error) => void }) {
    this.pending.push(item)
    this.iterations++
    item.cb().then(item.resolve).catch(item.reject).finally(() => {
      this.pending = this.pending.filter(p => p !== item)
      this._processQueue()
    })
  }

  private _processQueue() {

    this.concurrency = this.refactorConcurrency()

    if (this._isPaused || this._queue.length === 0 || this.pending.length >= this.concurrency) return
    const item = this.dequeue()
    this.emit('process', item)
    this._processQueue()
  }
}
