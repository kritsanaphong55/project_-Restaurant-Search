// routes/categories.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * GET /api/categories
 * Public — ดูประเภทอาหารทั้งหมด
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT foodtype_id, foodtype_name FROM food_types ORDER BY foodtype_name ASC"
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("LIST CATEGORIES ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/categories
 * ADMIN — เพิ่มประเภทอาหาร
 */
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { foodtype_name } = req.body;

    if (!foodtype_name) {
      return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อประเภทอาหาร" });
    }

    const [[existing]] = await pool.query(
      "SELECT foodtype_id FROM food_types WHERE foodtype_name = ?",
      [foodtype_name]
    );
    if (existing) {
      return res.status(409).json({ ok: false, message: "ประเภทอาหารนี้มีอยู่แล้ว" });
    }

    const [result] = await pool.query(
      "INSERT INTO food_types (foodtype_name) VALUES (?)",
      [foodtype_name]
    );

    res.json({ ok: true, foodtype_id: result.insertId, message: "เพิ่มประเภทอาหารสำเร็จ" });
  } catch (err) {
    console.error("CREATE CATEGORY ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/categories/:id
 * ADMIN — แก้ไขประเภทอาหาร
 */
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { foodtype_name } = req.body;

    if (!foodtype_name) {
      return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อประเภทอาหาร" });
    }

    const [[existing]] = await pool.query(
      "SELECT foodtype_id FROM food_types WHERE foodtype_id = ?",
      [id]
    );
    if (!existing) {
      return res.status(404).json({ ok: false, message: "ไม่พบประเภทอาหารนี้" });
    }

    await pool.query(
      "UPDATE food_types SET foodtype_name = ? WHERE foodtype_id = ?",
      [foodtype_name, id]
    );

    res.json({ ok: true, message: "แก้ไขประเภทอาหารสำเร็จ" });
  } catch (err) {
    console.error("UPDATE CATEGORY ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * DELETE /api/categories/:id
 * ADMIN — ลบประเภทอาหาร
 */
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[existing]] = await pool.query(
      "SELECT foodtype_id FROM food_types WHERE foodtype_id = ?",
      [id]
    );
    if (!existing) {
      return res.status(404).json({ ok: false, message: "ไม่พบประเภทอาหารนี้" });
    }

    await pool.query(
      "DELETE FROM restaurant_food_types WHERE foodtype_id = ?",
      [id]
    );
    await pool.query("DELETE FROM food_types WHERE foodtype_id = ?", [id]);

    res.json({ ok: true, message: "ลบประเภทอาหารสำเร็จ" });
  } catch (err) {
    console.error("DELETE CATEGORY ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

module.exports = router;