const { getStats, isRedisConfigured, redis } = require("./_lib/redis");

function normalizeNickname(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isRedisConfigured()) {
    res.status(200).json(await getStats());
    return;
  }

  const { type, sessionId, nickname, primary, secondary, questionIndex } = req.body || {};
  const now = new Date().toISOString();

  if (!type || !sessionId) {
    res.status(400).json({ error: "type and sessionId are required" });
    return;
  }

  const safeNickname = normalizeNickname(nickname);

  try {
    if (type === "start") {
      const commands = [
        redis("INCR", "work-brain:starts"),
        redis("SADD", "work-brain:users", sessionId),
        redis("HSET", "work-brain:startedAt", sessionId, now),
        redis("HSET", "work-brain:lastQuestion", sessionId, 0),
        redis("HSET", "work-brain:lastActiveAt", sessionId, now),
      ];

      if (safeNickname) {
        commands.push(redis("HSET", "work-brain:nicknames", sessionId, safeNickname));
      }

      await Promise.all(commands);
    } else if (type === "progress") {
      const commands = [redis("HSET", "work-brain:lastActiveAt", sessionId, now)];

      if (Number.isFinite(Number(questionIndex))) {
        commands.push(redis("HSET", "work-brain:lastQuestion", sessionId, Number(questionIndex)));
      }

      if (safeNickname) {
        commands.push(redis("HSET", "work-brain:nicknames", sessionId, safeNickname));
      }

      await Promise.all(commands);
    } else if (type === "complete") {
      const commands = [
        redis("INCR", "work-brain:completions"),
        redis("HSET", "work-brain:completedAt", sessionId, now),
        redis("HSET", "work-brain:lastQuestion", sessionId, 10),
        redis("HSET", "work-brain:lastActiveAt", sessionId, now),
      ];

      if (safeNickname) {
        commands.push(redis("HSET", "work-brain:nicknames", sessionId, safeNickname));
      }

      if (primary && secondary) {
        commands.push(redis("HSET", "work-brain:results", sessionId, `${primary}:${secondary}`));
      }

      await Promise.all(commands);
    } else if (type === "share") {
      const commands = [
        redis("INCR", "work-brain:shares"),
        redis("HSET", "work-brain:sharedAt", sessionId, now),
        redis("HSET", "work-brain:lastActiveAt", sessionId, now),
      ];

      if (safeNickname) {
        commands.push(redis("HSET", "work-brain:nicknames", sessionId, safeNickname));
      }

      if (primary && secondary) {
        commands.push(redis("HSET", "work-brain:results", sessionId, `${primary}:${secondary}`));
      }

      await Promise.all(commands);
    } else {
      res.status(400).json({ error: "Unsupported event type" });
      return;
    }

    res.status(200).json(await getStats());
  } catch (error) {
    res.status(500).json({ error: "Failed to track event" });
  }
};
