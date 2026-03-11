// middleware/auth.js
const jwt = require("jsonwebtoken");

// บังคับให้ตั้งค่า JWT_SECRET ใน .env
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is not defined in .env");
  process.exit(1);
}

/**
 * ตรวจสอบ token
 * ใช้กับ route ที่ต้อง login ก่อน
 */
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        ok: false,
        message: "No token provided",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Token missing",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      user_id: decoded.user_id,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (err) {
    // แยก error type ให้ชัดเจน
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        ok: false,
        message: "Token expired",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        ok: false,
        message: "Invalid token",
      });
    }

    console.error("AUTH ERROR:", err.name);
    return res.status(401).json({
      ok: false,
      message: "Authentication failed",
    });
  }
}

/**
 * ตรวจสอบ role
 * เช่น requireRole("admin") หรือ requireRole("admin", "owner")
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        message: "Forbidden: insufficient permissions",
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};