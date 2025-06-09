// src/workers/index.js
/**
 * Worker initialization file
 * Start all background workers
 */

const campaignSyncWorker = require('./campaign-sync.worker');

/**
 * Initialize all workers
 */
const initializeWorkers = () => {
  console.log('Initializing background workers...');
  
  // Start campaign sync worker
  campaignSyncWorker.start();
  
  // Add health check endpoint integration
  const getWorkersHealth = async () => {
    const health = {
      campaignSync: await campaignSyncWorker.getHealth()
    };
    
    return health;
  };
  
  // Graceful shutdown handler
  const shutdownWorkers = async () => {
    console.log('Shutting down workers...');
    await campaignSyncWorker.stop();
    console.log('Workers stopped');
  };
  
  // Handle process termination
  process.on('SIGTERM', shutdownWorkers);
  process.on('SIGINT', shutdownWorkers);
  
  return {
    getHealth: getWorkersHealth,
    shutdown: shutdownWorkers
  };
};

module.exports = initializeWorkers;

// Add to main application startup (e.g., server.js or app.js):
/*
const initializeWorkers = require('./workers');

// Start workers after database connection
mongoose.connection.once('open', () => {
  const workers = initializeWorkers();
  
  // Optionally expose health check via API
  app.get('/api/v1/health/workers', async (req, res) => {
    const health = await workers.getHealth();
    res.json({ status: 'ok', workers: health });
  });
});
*/