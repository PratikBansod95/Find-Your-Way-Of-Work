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

function normalizeHashResult(value) {
  if (!value) return {};

  if (Array.isArray(value)) {
    const entries = {};
    for (let i = 0; i < value.length; i += 2) {
      const key = value[i];
      const nextValue = value[i + 1];
      if (typeof key === "undefined") continue;
      entries[String(key)] = typeof nextValue === "undefined" ? "" : nextValue;
    }
    return entries;
  }

  if (typeof value === "object") {
    return value;
  }

  return {};
}

async function getStats() {
  if (!isRedisConfigured()) {
    return {
      configured: false,
      users: 0,
      starts: 0,
      completions: 0,
      shares: 0,
    };
  }

  const [users, starts, completions, shares] = await Promise.all([
    redis("SCARD", "work-brain:users"),
    redis("GET", "work-brain:starts"),
    redis("HLEN", "work-brain:completedAt"),
    redis("HLEN", "work-brain:sharedAt"),
  ]);

  return {
    configured: true,
    users: Number(users || 0),
    starts: Number(starts || 0),
    completions: Number(completions || 0),
    shares: Number(shares || 0),
  };
}

async function getAdminData() {
  const stats = await getStats();
  if (!stats.configured) {
    return {
      ...stats,
      sessions: [],
    };
  }

  const [nicknamesRaw, resultsRaw, completedAtRaw, sharedAtRaw, startedAtRaw, lastQuestionRaw, lastActiveAtRaw] = await Promise.all([
    redis("HGETALL", "work-brain:nicknames"),
    redis("HGETALL", "work-brain:results"),
    redis("HGETALL", "work-brain:completedAt"),
    redis("HGETALL", "work-brain:sharedAt"),
    redis("HGETALL", "work-brain:startedAt"),
    redis("HGETALL", "work-brain:lastQuestion"),
    redis("HGETALL", "work-brain:lastActiveAt"),
  ]);

  const nicknames = normalizeHashResult(nicknamesRaw);
  const results = normalizeHashResult(resultsRaw);
  const completedAt = normalizeHashResult(completedAtRaw);
  const sharedAt = normalizeHashResult(sharedAtRaw);
  const startedAt = normalizeHashResult(startedAtRaw);
  const lastQuestion = normalizeHashResult(lastQuestionRaw);
  const lastActiveAt = normalizeHashResult(lastActiveAtRaw);

  const ids = Array.from(
    new Set([
      ...Object.keys(nicknames || {}),
      ...Object.keys(results || {}),
      ...Object.keys(completedAt || {}),
      ...Object.keys(sharedAt || {}),
      ...Object.keys(startedAt || {}),
      ...Object.keys(lastQuestion || {}),
      ...Object.keys(lastActiveAt || {}),
    ])
  );

  const sessions = ids
    .map((id) => {
      const completed = Boolean(completedAt?.[id]);
      const questionReached = Number(lastQuestion?.[id] || 0);
      const started = Boolean(startedAt?.[id]);
      const status = completed
        ? "Completed"
        : started && questionReached > 0
        ? `Dropped at Q${Math.min(questionReached + 1, 10)}`
        : started
        ? "Started only"
        : "Unknown";

      return {
        sessionId: id,
        nickname: nicknames?.[id] || "",
        result: results?.[id] || "",
        startedAt: startedAt?.[id] || "",
        completedAt: completedAt?.[id] || "",
        sharedAt: sharedAt?.[id] || "",
        lastActiveAt: lastActiveAt?.[id] || "",
        lastQuestion: questionReached,
        completed,
        shared: Boolean(sharedAt?.[id]),
        status,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastActiveAt || a.sharedAt || a.completedAt || a.startedAt || "";
      const bTime = b.lastActiveAt || b.sharedAt || b.completedAt || b.startedAt || "";
      return aTime < bTime ? 1 : -1;
    });

  return {
    ...stats,
    sessions,
  };
}

module.exports = {
  getAdminData,
  getStats,
  isRedisConfigured,
  redis,
};
