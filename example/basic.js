const {Queue} = require('../dist/src');

const queue = new Queue({ maxCpuUsage: 0.5, maxMemoryUsage: 0.5, maxConcurrency: 100 });

async function main() {
  queue.on('concurrency_change', (concurrency) => {
    console.log('Concurrency changed to', concurrency);
  })

  // Add 10000 tasks to the queue
  for (let i = 0; i < 10000; i++) {
    // Add a task to the queue
    await queue.enqueue(() => {
      return task(i);
    }, 0, 2000);
    console.log('Added task to queue', i, '. Concurrency:', queue.currentConcurrency);
  }

  // Wait for the queue to finish
  await queue.done();
}

main().then(() => {
  console.log('Done');
}).catch(console.error).then(process.exit.bind(process, 0));


async function task(number) {
    for (let i = 0; i < 1000000000; i++) {}
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3000));
    console.log('Task', number);
}