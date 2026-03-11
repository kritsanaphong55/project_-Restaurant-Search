// routes/reviews.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * POST /api/reviews
 * USER เพิ่มรีวิว (PENDING)
 */
router.post("/", requireAuth, requireRole("USER"), async (req, res) => {
  try {
    const { restaurant_id, rating, comment } = req.body;

    if (!restaurant_id || rating == null) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลไม่ครบ" });
    }

    const ratingNum = Number(rating);
    if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ ok: false, message: "rating ต้องอยู่ 1-5" });
    }

    const [[rest]] = await pool.query(
      "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? AND status = 'APPROVED'",
      [restaurant_id]
    );
    if (!rest) {
      return res.status(400).json({ ok: false, message: "ร้านนี้ยังไม่ผ่านอนุมัติ" });
    }

    // ✅ เพิ่ม: กัน duplicate review
    const [[duplicate]] = await pool.query(
      "SELECT review_id FROM reviews WHERE restaurant_id = ? AND user_id = ?",
      [restaurant_id, req.user.user_id]
    );
    if (duplicate) {
      return res.status(409).json({
        ok: false,
        message: "คุณเคยรีวิวร้านนี้แล้ว",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO reviews (restaurant_id, user_id, rating, comment, review_status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [restaurant_id, req.user.user_id, ratingNum, comment || null]
    );

    return res.json({ ok: true, review_id: result.insertId });
  } catch (err) {
    console.error("CREATE REVIEW ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/reviews/mine
 * USER ดูรีวิวของตัวเอง
 */
router.get("/mine", requireAuth, requireRole("USER"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.review_id, r.restaurant_id, res.restaurant_name,
              r.rating, r.comment, r.review_status, r.created_at
       FROM reviews r
       JOIN restaurants res ON res.restaurant_id = r.restaurant_id
       WHERE r.user_id = ?
       ORDER BY r.review_id DESC`,
      [req.user.user_id]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("MY REVIEWS ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/reviews/pending
 * ADMIN ดูรีวิวที่รออนุมัติ
 */
router.get("/pending", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.review_id, r.restaurant_id, res.restaurant_name,
              r.user_id, u.username, r.rating, r.comment,
              r.review_status, r.created_at
       FROM reviews r
       JOIN restaurants res ON res.restaurant_id = r.restaurant_id
       JOIN users u ON u.user_id = r.user_id
       WHERE r.review_status = 'PENDING'
       ORDER BY r.review_id DESC`
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("LIST PENDING REVIEW ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/reviews/:id/approve
 * ADMIN อนุมัติรีวิว
 */
router.patch("/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[rv]] = await pool.query(
      "SELECT review_id FROM reviews WHERE review_id = ?",
      [id]
    );
    if (!rv) {
      return res.status(404).json({ ok: false, message: "ไม่พบรีวิวนี้" });
    }

    await pool.query(
      "UPDATE reviews SET review_status = 'APPROVED' WHERE review_id = ?",
      [id]
    );

    await pool.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, note)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.user_id, "APPROVE_REVIEW", "reviews", id, req.body.note || null]
    );

    return res.json({ ok: true, message: "อนุมัติรีวิวสำเร็จ" });
  } catch (err) {
    console.error("APPROVE REVIEW ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/reviews/:id/reject
 * ADMIN ปฏิเสธรีวิว
 */
router.patch("/:id/reject", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[rv]] = await pool.query(
      "SELECT review_id FROM reviews WHERE review_id = ?",
      [id]
    );
    if (!rv) {
      return res.status(404).json({ ok: false, message: "ไม่พบรีวิวนี้" });
    }

    await pool.query(
      "UPDATE reviews SET review_status = 'REJECTED' WHERE review_id = ?",
      [id]
    );

    await pool.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, note)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.user_id, "REJECT_REVIEW", "reviews", id, req.body.note || null]
    );

    return res.json({ ok: true, message: "ปฏิเสธรีวิวสำเร็จ" });
  } catch (err) {
    console.error("REJECT REVIEW ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/reviews/restaurant/:id
 * Public ดูรีวิว APPROVED ของร้าน
 */
router.get("/restaurant/:id", async (req, res) => {
  try {
    const restaurantId = Number(req.params.id);

    const [rows] = await pool.query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at, u.username
       FROM reviews r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.restaurant_id = ? AND r.review_status = 'APPROVED'
       ORDER BY r.review_id DESC`,
      [restaurantId]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET RESTAURANT REVIEWS ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

module.exports = router;