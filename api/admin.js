const { getAdminData } = require("./_lib/redis");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const data = await getAdminData();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to load admin data" });
  }
};
