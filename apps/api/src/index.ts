import { buildServer } from './server.js';
import { config } from './config.js';

async function main() {
  const server = await buildServer();

  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    server.log.info(`🚀 API Gateway active at ${address}`);
    server.log.info(`📡 Evolution Webhook: POST ${address}/webhooks/evolution/:tenantId`);
    server.log.info(`📡 Meta Webhook:      POST ${address}/webhooks/meta/:tenantId`);
    server.log.info(`📡 Razorpay Webhook:  POST ${address}/webhooks/razorpay/:tenantId`);
    server.log.info(`🏥 Health Check:      GET  ${address}/health`);
  } catch (err) {
    server.log.fatal({ err }, 'Failed to start API Gateway');
    process.exit(1);
  }
}

main();
