import { loadConfig } from './server/config.js';
import { createVitalViewServer } from './server/app.js';

const config = loadConfig();
const server = createVitalViewServer(config);

server.on('error', (error) => {
  console.error(`Unable to start VitalView: ${error.message}`);
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  const hostname = config.host.includes(':') ? `[${config.host}]` : config.host;
  console.log(`VitalView research studio: http://${hostname}:${config.port}`);
});
