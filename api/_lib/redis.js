const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function isRedisConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redis(command, ...args) {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured");
  }

  const path = [command, ...args].map((value) => encodeURIComponent(String(value))).join("/");
  const response = await fetch(`${REDIS_URL}/${path}`, {
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Redis request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  return payload.result;
}

async function getStats() {
  if (!isRedisConfigured()) {
    return {
      configured: false,
      users: 0,
      starts: 0,
      shares: 0,
    };
  }

  const [users, starts, shares] = await Promise.all([
    redis("SCARD", "work-brain:users"),
    redis("GET", "work-brain:starts"),
    redis("GET", "work-brain:shares"),
  ]);

  return {
    configured: true,
    users: Number(users || 0),
    starts: Number(starts || 0),
    shares: Number(shares || 0),
  };
}

module.exports = {
  getStats,
  isRedisConfigured,
  redis,
};
