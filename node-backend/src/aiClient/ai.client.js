const axios = require('axios');
const config = require('../config');

const baseUrl = config.aiService.url;

/**
 * Turns a Mongo Job document into the payload FastAPI /index expects.
 * The Mongo _id becomes the Chroma id, so both stores share the same ids.
 */
const toIndexPayload = (job) => {
  const posted = job.postedDate || job.createdAt;
  return {
    job_id: String(job._id),
    title: job.title,
    company: job.company,
    location: job.location || 'Remote',
    url: job.url,
    tags: job.tags || [],
    posted_date: posted ? Math.floor(new Date(posted).getTime() / 1000) : 0,
    description: job.parsedDescription || '',
  };
};

/** Index one job in ChromaDB (via FastAPI). Throws on failure; callers decide what to do. */
const indexJob = async (job) => {
  const { data } = await axios.post(`${baseUrl}/index`, toIndexPayload(job), { timeout: 30000 });
  return data;
};

/** Index many jobs in one request. */
const indexJobsBulk = async (jobs) => {
  const { data } = await axios.post(
    `${baseUrl}/index/bulk`,
    { jobs: jobs.map(toIndexPayload) },
    { timeout: 120000 }
  );
  return data;
};

/** Number of jobs currently in ChromaDB. */
const getIndexCount = async () => {
  const { data } = await axios.get(`${baseUrl}/index/stats`, { timeout: 10000 });
  return data.count;
};

module.exports = { toIndexPayload, indexJob, indexJobsBulk, getIndexCount };
