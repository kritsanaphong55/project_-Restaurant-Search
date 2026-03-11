// config/db.js
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  timezone: "+07:00",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ทดสอบการเชื่อมต่อ — เรียกใช้ใน server.js ตอนเริ่มระบบ
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    connection.release();
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1); // หยุด server ถ้าเชื่อมต่อ DB ไม่ได้
  }
};

module.exports = { pool, testConnection };