const {Queue} = require('../dist/src');

const queue = new Queue({ maxConcurrency: 10 });

async function main() {
  // Add a task to the queue
  await queue.enqueue(async () => {
    console.log('Hello World');
  });

  for (let i = 0; i < 100; i++) {
    // Add a task to the queue
    await queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(() => {
        console.log('Hello World: ', i);
        resolve();
      }, 1000));
    });
  }

  // Wait for the queue to finish
  await queue.done();
}

main().then(() => {
  console.log('Done');
}).catch(console.error).then(process.exit.bind(process, 0));
