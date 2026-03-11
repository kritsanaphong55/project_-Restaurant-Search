// routes/restaurant_images.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const path = require("path");
const fs = require("fs");

async function assertRestaurantOwner(restaurant_id, owner_id) {
  const [[row]] = await pool.query(
    "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? AND owner_id = ?",
    [restaurant_id, owner_id]
  );
  return !!row;
}

/**
 * GET /api/restaurant-images?restaurant_id=1
 * OWNER ดูรูปของร้านตัวเอง
 */
router.get("/", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const restaurant_id = Number(req.query.restaurant_id);
    if (!restaurant_id) {
      return res.status(400).json({ ok: false, message: "ต้องส่ง restaurant_id" });
    }

    const ok = await assertRestaurantOwner(restaurant_id, req.user.user_id);
    if (!ok) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์เข้าถึงร้านนี้" });
    }

    const [rows] = await pool.query(
      `SELECT image_id, restaurant_id, image_url, caption
       FROM restaurant_images
       WHERE restaurant_id = ?
       ORDER BY image_id DESC`,
      [restaurant_id]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET RESTAURANT IMAGES ERROR:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/restaurant-images
 * OWNER เพิ่มรูปให้ร้านตัวเอง
 */
router.post("/", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const { restaurant_id, image_url, caption } = req.body;

    if (!restaurant_id || !image_url) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลไม่ครบ" });
    }

    const ok = await assertRestaurantOwner(Number(restaurant_id), req.user.user_id);
    if (!ok) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์เพิ่มรูปให้ร้านนี้" });
    }

    const [result] = await pool.query(
      "INSERT INTO restaurant_images (restaurant_id, image_url, caption) VALUES (?, ?, ?)",
      [restaurant_id, image_url, caption || null]
    );

    res.json({ ok: true, image_id: result.insertId });
  } catch (err) {
    console.error("CREATE RESTAURANT IMAGE ERROR:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/restaurant-images/:id
 * OWNER ลบรูป
 */
router.delete("/:id", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const image_id = Number(req.params.id);

    const [[img]] = await pool.query(
      "SELECT image_id, restaurant_id, image_url FROM restaurant_images WHERE image_id = ?",
      [image_id]
    );
    if (!img) {
      return res.status(404).json({ ok: false, message: "ไม่พบรูปนี้" });
    }

    const ok = await assertRestaurantOwner(img.restaurant_id, req.user.user_id);
    if (!ok) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ลบรูปนี้" });
    }

    await pool.query("DELETE FROM restaurant_images WHERE image_id = ?", [image_id]);

    // ✅ ลบไฟล์จริงออกจาก disk
    if (img.image_url) {
      const filename = path.basename(img.image_url);
      const filepath = path.join(__dirname, "..", "uploads", filename);
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          console.error("DELETE FILE ERROR:", unlinkErr.message);
        }
      });
    }

    res.json({ ok: true, message: "ลบรูปสำเร็จ" });
  } catch (err) {
    console.error("DELETE RESTAURANT IMAGE ERROR:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;