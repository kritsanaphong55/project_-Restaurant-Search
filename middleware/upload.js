// middleware/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// นามสกุลไฟล์รูปที่อนุญาต
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const isMimeValid = ALLOWED_MIMETYPES.includes(file.mimetype);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "อนุญาตเฉพาะไฟล์รูปภาพ (.jpg, .jpeg, .png, .gif, .webp)"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/**
 * Middleware จัดการ error จาก multer
 * ใช้ต่อหลัง upload ใน route
 * 
 * ตัวอย่างใช้งานใน route:
 *   router.post("/", upload.single("image"), handleUploadError, (req, res) => { ... })
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        ok: false,
        message: "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)",
      });
    }
    return res.status(400).json({
      ok: false,
      message: err.message || "เกิดข้อผิดพลาดในการอัปโหลด",
    });
  }

  if (err) {
    return res.status(400).json({
      ok: false,
      message: err.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด",
    });
  }

  next();
}

module.exports = { upload, handleUploadError };