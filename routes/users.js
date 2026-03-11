// routes/users.js
const router = require("express").Router();
const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * GET /api/users/me
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT user_id, username, full_name, email, phone, role
       FROM users WHERE user_id = ?`,
      [req.user.user_id]
    );

    if (!user) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้" });
    }

    return res.json({ ok: true, user });
  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/users/me
 */
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;

    // ✅ ดึงข้อมูลเดิมก่อน เพื่อไม่ให้ null ทับ
    const [[current]] = await pool.query(
      "SELECT full_name, email, phone FROM users WHERE user_id = ?",
      [req.user.user_id]
    );
    if (!current) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้" });
    }

    const newFullName = full_name !== undefined ? full_name : current.full_name;
    const newPhone = phone !== undefined ? phone : current.phone;
    const newEmail = email !== undefined ? email : current.email;

    if (newEmail && newEmail !== current.email) {
      const [[existing]] = await pool.query(
        "SELECT user_id FROM users WHERE email = ? AND user_id <> ?",
        [newEmail, req.user.user_id]
      );
      if (existing) {
        return res.status(409).json({ ok: false, message: "Email นี้ถูกใช้งานแล้ว" });
      }
    }

    if (password && String(password).length < 4) {
      return res.status(400).json({ ok: false, message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" });
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET full_name = ?, email = ?, phone = ?, password_hash = ?
         WHERE user_id = ?`,
        [newFullName, newEmail, newPhone, hashed, req.user.user_id]
      );
    } else {
      await pool.query(
        `UPDATE users SET full_name = ?, email = ?, phone = ? WHERE user_id = ?`,
        [newFullName, newEmail, newPhone, req.user.user_id]
      );
    }

    return res.json({ ok: true, message: "อัปเดตข้อมูลสำเร็จ" });
  } catch (err) {
    console.error("UPDATE ME ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/users
 * ADMIN
 */
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, username, full_name, email, phone, role
       FROM users ORDER BY user_id DESC`
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("LIST USERS ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/users/:id
 * ADMIN แก้ user
 */
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { full_name, email, phone, role, password } = req.body;

    const [[user]] = await pool.query(
      "SELECT user_id, full_name, email, phone, role FROM users WHERE user_id = ?",
      [id]
    );
    if (!user) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    }

    const safeRole =
      role === "ADMIN" || role === "OWNER" || role === "USER"
        ? role
        : user.role;

    // ✅ ใช้ค่าเดิมถ้าไม่ส่งมา
    const newFullName = full_name !== undefined ? full_name : user.full_name;
    const newPhone = phone !== undefined ? phone : user.phone;
    const newEmail = email !== undefined ? email : user.email;

    if (newEmail && newEmail !== user.email) {
      const [[existing]] = await pool.query(
        "SELECT user_id FROM users WHERE email = ? AND user_id <> ?",
        [newEmail, id]
      );
      if (existing) {
        return res.status(409).json({ ok: false, message: "Email นี้ถูกใช้งานแล้ว" });
      }
    }

    if (password && String(password).length < 4) {
      return res.status(400).json({ ok: false, message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" });
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, password_hash = ?
         WHERE user_id = ?`,
        [newFullName, newEmail, newPhone, safeRole, hashed, id]
      );
    } else {
      await pool.query(
        `UPDATE users SET full_name = ?, email = ?, phone = ?, role = ? WHERE user_id = ?`,
        [newFullName, newEmail, newPhone, safeRole, id]
      );
    }

    return res.json({ ok: true, message: "แก้ไขผู้ใช้สำเร็จ" });
  } catch (err) {
    console.error("ADMIN UPDATE USER ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * DELETE /api/users/:id
 * ADMIN ลบ user
 */
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (id === Number(req.user.user_id)) {
      return res.status(400).json({ ok: false, message: "ไม่สามารถลบบัญชีของตัวเองได้" });
    }

    const [[user]] = await pool.query(
      "SELECT user_id, username, role FROM users WHERE user_id = ?",
      [id]
    );
    if (!user) {
      return res.status(404).json({ ok: false, message: "ไม่พบผู้ใช้นี้" });
    }

    const [[ownedRestaurant]] = await pool.query(
      "SELECT restaurant_id, restaurant_name FROM restaurants WHERE owner_id = ? LIMIT 1",
      [id]
    );
    if (ownedRestaurant) {
      return res.status(409).json({
        ok: false,
        message: `ลบผู้ใช้นี้ไม่ได้ เพราะยังเป็นเจ้าของร้าน "${ownedRestaurant.restaurant_name}"`,
      });
    }

    await pool.query("DELETE FROM reviews WHERE user_id = ?", [id]);
    await pool.query("DELETE FROM users WHERE user_id = ?", [id]);

    return res.json({ ok: true, message: "ลบผู้ใช้สำเร็จ" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

module.exports = router;