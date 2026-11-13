/**
 * Sends every job in MongoDB to FastAPI /index/bulk so ChromaDB has them all.
 * Safe to run again: Chroma upserts by Mongo _id, so nothing is duplicated.
 *
 * Usage (from node-backend/):  node scripts/backfill-index.js
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const Job = require('../src/db/models/Job.model');
const aiClient = require('../src/aiClient/ai.client');

const BATCH_SIZE = 100;

const run = async () => {
  await mongoose.connect(config.mongo.uri);
  const mongoCount = await Job.countDocuments();
  console.log(`Mongo jobs: ${mongoCount}. Indexing in batches of ${BATCH_SIZE}...`);

  let sent = 0;
  let failedBatches = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    try {
      await aiClient.indexJobsBulk(batch);
      sent += batch.length;
      console.log(`  indexed ${sent}/${mongoCount}`);
    } catch (err) {
      failedBatches++;
      console.error(`  batch of ${batch.length} failed: ${err.message}`);
    }
    batch = [];
  };

  const cursor = Job.find({}, 'title company location url tags postedDate createdAt parsedDescription')
    .lean()
    .cursor();
  for await (const job of cursor) {
    batch.push(job);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  const chromaCount = await aiClient.getIndexCount();
  console.log(`Done. Mongo: ${mongoCount}, Chroma: ${chromaCount}, failed batches: ${failedBatches}`);
  console.log(mongoCount === chromaCount ? 'Counts match.' : 'Counts DIFFER.');

  await mongoose.disconnect();
  process.exit(failedBatches ? 1 : 0);
};

run().catch(async (err) => {
  console.error('Backfill failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
