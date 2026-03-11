// routes/menu.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { upload, handleUploadError } = require("../middleware/upload");

function buildFileUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${filename}`;
}

async function canManageRestaurant(user, restaurantId) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "OWNER") return false;

  const [[restaurant]] = await pool.query(
    "SELECT owner_id FROM restaurants WHERE restaurant_id = ?",
    [restaurantId]
  );

  return !!restaurant && restaurant.owner_id === user.user_id;
}

/**
 * GET /api/menu/restaurant/:restaurantId
 * Public
 */
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    const [rows] = await pool.query(
      `SELECT menu_id, restaurant_id, menu_name, description, price, image_url, is_available
       FROM menu
       WHERE restaurant_id = ?
       ORDER BY menu_id DESC`,
      [restaurantId]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET MENU ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/menu
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { restaurant_id, menu_name, description, price } = req.body;

    if (!restaurant_id || !menu_name || price == null) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลเมนูไม่ครบ" });
    }

    const allowed = await canManageRestaurant(req.user, Number(restaurant_id));
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์จัดการเมนูของร้านนี้" });
    }

    const [result] = await pool.query(
      `INSERT INTO menu (restaurant_id, menu_name, description, price, is_available)
       VALUES (?, ?, ?, ?, 1)`,
      [restaurant_id, menu_name, description || null, Number(price)]
    );

    res.json({ ok: true, menu_id: result.insertId });
  } catch (err) {
    console.error("CREATE MENU ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PUT /api/menu/:id  ✅ เพิ่มใหม่
 * แก้ไขข้อมูลเมนู
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { menu_name, description, price } = req.body;

    if (!menu_name || price == null) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลไม่ครบ" });
    }

    const [[item]] = await pool.query(
      "SELECT menu_id, restaurant_id FROM menu WHERE menu_id = ?",
      [id]
    );
    if (!item) {
      return res.status(404).json({ ok: false, message: "ไม่พบเมนูนี้" });
    }

    const allowed = await canManageRestaurant(req.user, item.restaurant_id);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์แก้ไขเมนูนี้" });
    }

    await pool.query(
      "UPDATE menu SET menu_name = ?, description = ?, price = ? WHERE menu_id = ?",
      [menu_name, description || null, Number(price), id]
    );

    res.json({ ok: true, message: "แก้ไขเมนูสำเร็จ" });
  } catch (err) {
    console.error("UPDATE MENU ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/menu/:id/toggle-available
 */
router.patch("/:id/toggle-available", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[item]] = await pool.query(
      "SELECT menu_id, restaurant_id, is_available FROM menu WHERE menu_id = ?",
      [id]
    );
    if (!item) {
      return res.status(404).json({ ok: false, message: "ไม่พบเมนูนี้" });
    }

    const allowed = await canManageRestaurant(req.user, item.restaurant_id);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์จัดการเมนูนี้" });
    }

    const newValue = item.is_available ? 0 : 1;
    await pool.query(
      "UPDATE menu SET is_available = ? WHERE menu_id = ?",
      [newValue, id]
    );

    res.json({
      ok: true,
      is_available: newValue,
      message: newValue ? "เมนูพร้อมขายแล้ว" : "เมนูนี้หมดแล้ว",
    });
  } catch (err) {
    console.error("TOGGLE MENU AVAILABLE ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/menu/:id/upload
 * ✅ เพิ่ม handleUploadError
 */
router.post(
  "/:id/upload",
  requireAuth,
  upload.single("image"),
  handleUploadError,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const [[item]] = await pool.query(
        "SELECT menu_id, restaurant_id FROM menu WHERE menu_id = ?",
        [id]
      );
      if (!item) {
        return res.status(404).json({ ok: false, message: "ไม่พบเมนูนี้" });
      }

      const allowed = await canManageRestaurant(req.user, item.restaurant_id);
      if (!allowed) {
        return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์อัปโหลดรูปเมนูนี้" });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, message: "กรุณาเลือกไฟล์รูป" });
      }

      const imageUrl = buildFileUrl(req, req.file.filename);
      await pool.query(
        "UPDATE menu SET image_url = ? WHERE menu_id = ?",
        [imageUrl, id]
      );

      res.json({ ok: true, image_url: imageUrl });
    } catch (err) {
      console.error("UPLOAD MENU IMAGE ERROR:", err);
      res.status(500).json({
        ok: false,
        message: "Server error",
        error: err.code || err.message,
        sqlMessage: err.sqlMessage || null,
      });
    }
  }
);

/**
 * DELETE /api/menu/:id
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[item]] = await pool.query(
      "SELECT menu_id, restaurant_id FROM menu WHERE menu_id = ?",
      [id]
    );
    if (!item) {
      return res.status(404).json({ ok: false, message: "ไม่พบเมนูนี้" });
    }

    const allowed = await canManageRestaurant(req.user, item.restaurant_id);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ลบเมนูนี้" });
    }

    await pool.query("DELETE FROM menu WHERE menu_id = ?", [id]);

    res.json({ ok: true, message: "ลบเมนูสำเร็จ" });
  } catch (err) {
    console.error("DELETE MENU ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

module.exports = router;