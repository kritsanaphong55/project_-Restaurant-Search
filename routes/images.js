// routes/images.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const path = require("path");
const fs = require("fs");

/**
 * GET /api/images/restaurant/:restaurantId
 * Public — ดึงรูปของร้าน
 */
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    const [rows] = await pool.query(
      `SELECT image_id, restaurant_id, image_url, caption
       FROM restaurant_images
       WHERE restaurant_id = ?
       ORDER BY image_id DESC`,
      [restaurantId]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET RESTAURANT IMAGES ERROR:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/images/restaurant/:restaurantId
 * OWNER — เพิ่มรูปให้ร้านตัวเอง
 * body: { image_url, caption? }
 */
router.post(
  "/restaurant/:restaurantId",
  requireAuth,
  requireRole("OWNER"),
  async (req, res) => {
    try {
      const restaurantId = Number(req.params.restaurantId);
      const { image_url, caption } = req.body;

      if (!image_url) {
        return res.status(400).json({ ok: false, message: "ต้องมี image_url" });
      }

      const [[rest]] = await pool.query(
        "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? AND owner_id = ?",
        [restaurantId, req.user.user_id]
      );
      if (!rest) {
        return res.status(403).json({ ok: false, message: "ไม่ใช่ร้านของคุณ" });
      }

      const [result] = await pool.query(
        "INSERT INTO restaurant_images (restaurant_id, image_url, caption) VALUES (?, ?, ?)",
        [restaurantId, image_url, caption || null]
      );

      res.json({ ok: true, image_id: result.insertId });
    } catch (err) {
      console.error("ADD IMAGE ERROR:", err);
      res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

/**
 * DELETE /api/images/:imageId
 * OWNER/ADMIN — ลบรูป
 */
router.delete(
  "/:imageId",
  requireAuth,
  requireRole("OWNER", "ADMIN"),
  async (req, res) => {
    try {
      const imageId = Number(req.params.imageId);

      const [[row]] = await pool.query(
        `SELECT ri.image_id, ri.image_url, ri.restaurant_id, r.owner_id
         FROM restaurant_images ri
         JOIN restaurants r ON r.restaurant_id = ri.restaurant_id
         WHERE ri.image_id = ?`,
        [imageId]
      );

      if (!row) {
        return res.status(404).json({ ok: false, message: "ไม่พบรูปนี้" });
      }

      // OWNER ต้องเป็นเจ้าของร้าน, ADMIN ลบได้เลย
      if (req.user.role === "OWNER" && row.owner_id !== req.user.user_id) {
        return res.status(403).json({ ok: false, message: "ไม่ใช่ร้านของคุณ" });
      }

      await pool.query(
        "DELETE FROM restaurant_images WHERE image_id = ?",
        [imageId]
      );

      // ✅ ลบไฟล์จริงออกจาก disk (ถ้า image_url เป็น path ใน uploads/)
      if (row.image_url) {
        const filename = path.basename(row.image_url);
        const filepath = path.join(__dirname, "..", "uploads", filename);
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== "ENOENT") {
            console.error("DELETE FILE ERROR:", unlinkErr.message);
          }
        });
      }

      res.json({ ok: true, message: "ลบรูปสำเร็จ" });
    } catch (err) {
      console.error("DELETE IMAGE ERROR:", err);
      res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

module.exports = router;