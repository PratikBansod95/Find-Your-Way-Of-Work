const { getStats, isRedisConfigured, redis } = require("./_lib/redis");

function normalizeNickname(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function getBaseSessionCommands(sessionId, now, safeNickname) {
  const commands = [
    redis("SADD", "work-brain:users", sessionId),
    redis("HSET", "work-brain:lastActiveAt", sessionId, now),
  ];

  if (safeNickname) {
    commands.push(redis("HSET", "work-brain:nicknames", sessionId, safeNickname));
  }

  return commands;
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
        ...getBaseSessionCommands(sessionId, now, safeNickname),
        redis("INCR", "work-brain:starts"),
        redis("HSET", "work-brain:startedAt", sessionId, now),
        redis("HSET", "work-brain:lastQuestion", sessionId, 0),
      ];

      await Promise.all(commands);
    } else if (type === "progress") {
      const commands = getBaseSessionCommands(sessionId, now, safeNickname);

      if (Number.isFinite(Number(questionIndex))) {
        commands.push(redis("HSET", "work-brain:lastQuestion", sessionId, Number(questionIndex)));
      }

      await Promise.all(commands);
    } else if (type === "complete") {
      const commands = [
        ...getBaseSessionCommands(sessionId, now, safeNickname),
        redis("HSET", "work-brain:completedAt", sessionId, now),
        redis("HSET", "work-brain:lastQuestion", sessionId, 10),
      ];

      if (primary && secondary) {
        commands.push(redis("HSET", "work-brain:results", sessionId, `${primary}:${secondary}`));
      }

      await Promise.all(commands);
    } else if (type === "share") {
      const commands = [
        ...getBaseSessionCommands(sessionId, now, safeNickname),
        redis("HSET", "work-brain:sharedAt", sessionId, now),
      ];

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
