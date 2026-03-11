// routes/auth.js
const router = require("express").Router();
const { pool } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { requireAuth, requireRole } = require("../middleware/auth");

/**
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอก username, password และ email",
      });
    }

    if (String(password).length < 4) {
      return res.status(400).json({
        ok: false,
        message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร",
      });
    }

    const safeRole = role === "OWNER" ? "OWNER" : "USER";

    const [[existingUser]] = await pool.query(
      "SELECT user_id FROM users WHERE username = ?",
      [username]
    );
    if (existingUser) {
      return res.status(409).json({ ok: false, message: "Username นี้ถูกใช้งานแล้ว" });
    }

    const [[existingEmail]] = await pool.query(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );
    if (existingEmail) {
      return res.status(409).json({ ok: false, message: "Email นี้ถูกใช้งานแล้ว" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, phone, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, full_name || null, email, phone || null, safeRole]
    );

    return res.json({
      ok: true,
      user_id: result.insertId,
      message: "สมัครสมาชิกสำเร็จ",
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอก username และ password",
      });
    }

    const [[user]] = await pool.query(
      `SELECT user_id, username, password_hash, full_name, email, phone, role, status
       FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
      });
    }

    // ✅ เพิ่ม: กัน user ที่ถูก ban
    if (user.status === "BANNED" || user.status === "INACTIVE") {
      return res.status(403).json({
        ok: false,
        message: "บัญชีนี้ถูกระงับการใช้งาน",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        ok: false,
        message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/auth/forgot-password
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { username, email, new_password } = req.body;

    if (!username || !email || !new_password) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอก username, email และรหัสผ่านใหม่",
      });
    }

    if (String(new_password).length < 4) {
      return res.status(400).json({
        ok: false,
        message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร",
      });
    }

    const [[user]] = await pool.query(
      "SELECT user_id FROM users WHERE username = ? AND email = ?",
      [username, email]
    );

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบข้อมูลผู้ใช้ที่ตรงกับ username และ email นี้",
      });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE user_id = ?",
      [hashedPassword, user.user_id]
    );

    return res.json({ ok: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/auth/admin/create-owner
 */
router.post(
  "/admin/create-owner",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { username, password, full_name, email, phone } = req.body;

      if (!username || !password || !email) {
        return res.status(400).json({
          ok: false,
          message: "กรุณากรอก username, password และ email",
        });
      }

      if (String(password).length < 4) {
        return res.status(400).json({
          ok: false,
          message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร",
        });
      }

      const [[existingUser]] = await pool.query(
        "SELECT user_id FROM users WHERE username = ?",
        [username]
      );
      if (existingUser) {
        return res.status(409).json({ ok: false, message: "Username นี้ถูกใช้งานแล้ว" });
      }

      const [[existingEmail]] = await pool.query(
        "SELECT user_id FROM users WHERE email = ?",
        [email]
      );
      if (existingEmail) {
        return res.status(409).json({ ok: false, message: "Email นี้ถูกใช้งานแล้ว" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, email, phone, role)
         VALUES (?, ?, ?, ?, ?, 'OWNER')`,
        [username, hashedPassword, full_name || null, email, phone || null]
      );

      return res.json({ ok: true, user_id: result.insertId, message: "สร้าง Owner สำเร็จ" });
    } catch (err) {
      console.error("CREATE OWNER ERROR:", err);
      return res.status(500).json({
        ok: false,
        message: "Server error",
        error: err.code || err.message,
        sqlMessage: err.sqlMessage || null,
      });
    }
  }
);

module.exports = router;