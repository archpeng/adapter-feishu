import { loadConfig } from './config.js';
import { createAdapterRuntime } from './runtime.js';

const config = loadConfig();
const runtime = createAdapterRuntime(config);

await runtime.start();

console.log(
  `adapter-feishu started on ${config.service.host}:${config.service.port} (${config.feishu.ingressMode})`
);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`adapter-feishu stopping after ${signal}`);
  await runtime.stop();
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void shutdown(signal).then(
      () => process.exit(0),
      (error) => {
        console.error('adapter-feishu shutdown failed', error);
        process.exit(1);
      }
    );
  });
}
