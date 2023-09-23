export type TaskParams<T> = {
  fn: () => Promise<T>
  priority: number
  deadline: number | null
}

export class Task<ReturnValue> {
  private readonly fn: () => Promise<ReturnValue>
  public priority: number
  private readonly deadline: number | null
  private timer: NodeJS.Timeout | null
  public promise: Promise<ReturnValue>
  private resolveFn: (data: ReturnValue) => void
  private rejectFn: (err: Error) => void

  constructor(params: TaskParams<ReturnValue>) {
    this.fn = params.fn
    this.priority = params.priority
    this.deadline = params.deadline
    this.timer = null
    this.resolveFn = (data) => {}
    this.rejectFn = () => {}
    this.promise = new Promise<ReturnValue>((resolve, reject) => {
      this.resolveFn = resolve
      this.rejectFn = reject
    })
  }

  startTimer() {
    if (this.deadline) {
      this.timer = setTimeout(() => {
        this.promise = Promise.reject(new Error(`Task Deadline of ${this.deadline}ms exceeded`))
      }, this.deadline)
    }
  }

  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  async run(): Promise<void> {
    return this.fn()
      .then(res => {
        this.resolveFn(res)
      })
      .catch(err => {
        this.rejectFn(err)
      })
  }

}