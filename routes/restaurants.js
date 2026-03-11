// routes/restaurants.js
const router = require("express").Router();
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { upload, handleUploadError } = require("../middleware/upload");
const path = require("path");
const fs = require("fs");

function buildFileUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${filename}`;
}

// ── SQL helpers ──────────────────────────────────────────────
const isOpenNowSql = `
  CASE
    WHEN r.is_active = 0 THEN 0
    WHEN r.open_time IS NULL OR r.close_time IS NULL THEN 0
    WHEN r.open_time <= r.close_time
      THEN CASE WHEN CURTIME() BETWEEN r.open_time AND r.close_time THEN 1 ELSE 0 END
    ELSE
      CASE WHEN CURTIME() >= r.open_time OR CURTIME() <= r.close_time THEN 1 ELSE 0 END
  END
`;

const openNowWhereSql = `
  r.is_active = 1 AND (
    (r.open_time <= r.close_time AND CURTIME() BETWEEN r.open_time AND r.close_time)
    OR
    (r.open_time > r.close_time AND (CURTIME() >= r.open_time OR CURTIME() <= r.close_time))
  )
`;

// subquery ดึง food_types ของร้านเป็น JSON array
const foodTypesSql = `
  (
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT('foodtype_id', ft.foodtype_id, 'foodtype_name', ft.foodtype_name)
    )
    FROM restaurant_food_types rft
    JOIN food_types ft ON ft.foodtype_id = rft.foodtype_id
    WHERE rft.restaurant_id = r.restaurant_id
  ) AS food_types
`;

// ─────────────────────────────────────────────────────────────
// ⚠️ IMPORTANT: static routes ต้องอยู่เหนือ /:id เสมอ
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/restaurants/search?q=&min=&max=&foodtype_id=&open_now=1
 */
router.get("/search", async (req, res) => {
  try {
    const { q, min, max, foodtype_id, open_now } = req.query;

    let sql = `
      SELECT
        r.restaurant_id,
        r.restaurant_name,
        r.description,
        r.address,
        r.latitude,
        r.longitude,
        r.open_time,
        r.close_time,
        r.price_min,
        r.price_max,
        r.owner_id,
        r.status,
        r.is_active,
        ${isOpenNowSql} AS is_open_now,
        ${foodTypesSql},
        COALESCE(AVG(CASE WHEN rv.review_status = 'APPROVED' THEN rv.rating END), 0) AS avg_rating,
        SUM(CASE WHEN rv.review_status = 'APPROVED' THEN 1 ELSE 0 END) AS review_count,
        (
          SELECT ri.image_url FROM restaurant_images ri
          WHERE ri.restaurant_id = r.restaurant_id
          ORDER BY ri.image_id DESC LIMIT 1
        ) AS cover_image
      FROM restaurants r
      LEFT JOIN reviews rv ON rv.restaurant_id = r.restaurant_id
      WHERE r.status = 'APPROVED'
    `;

    const params = [];

    if (q) {
      sql += " AND r.restaurant_name LIKE ?";
      params.push(`%${q}%`);
    }
    if (min) {
      sql += " AND r.price_min >= ?";
      params.push(Number(min));
    }
    if (max) {
      sql += " AND r.price_max <= ?";
      params.push(Number(max));
    }
    // ✅ ถ้าต้องการกรองตาม foodtype ให้ใช้ EXISTS แทน JOIN เพื่อไม่ให้ duplicate rows
    if (foodtype_id) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM restaurant_food_types rft
          WHERE rft.restaurant_id = r.restaurant_id AND rft.foodtype_id = ?
        )
      `;
      params.push(Number(foodtype_id));
    }
    if (String(open_now) === "1") {
      sql += ` AND ${openNowWhereSql}`;
    }

    sql += " GROUP BY r.restaurant_id ORDER BY r.restaurant_id DESC";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("SEARCH RESTAURANTS ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/restaurants/mine
 * OWNER ดูร้านตัวเอง
 */
router.get("/mine", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        r.restaurant_id, r.restaurant_name, r.description, r.address,
        r.latitude, r.longitude, r.open_time, r.close_time,
        r.price_min, r.price_max, r.status, r.is_active, r.owner_id,
        ${isOpenNowSql} AS is_open_now,
        ${foodTypesSql}
       FROM restaurants r
       WHERE r.owner_id = ?
       ORDER BY r.restaurant_id DESC`,
      [req.user.user_id]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET MINE RESTAURANTS ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/restaurants/map
 * Public — ดึงข้อมูลร้านสำหรับแสดงบนแผนที่
 */
router.get("/map", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        r.restaurant_id, r.restaurant_name, r.latitude, r.longitude,
        r.price_min, r.price_max, r.is_active,
        ${isOpenNowSql} AS is_open_now,
        ${foodTypesSql},
        COALESCE(AVG(CASE WHEN rv.review_status = 'APPROVED' THEN rv.rating END), 0) AS avg_rating,
        SUM(CASE WHEN rv.review_status = 'APPROVED' THEN 1 ELSE 0 END) AS review_count,
        (
          SELECT ri.image_url FROM restaurant_images ri
          WHERE ri.restaurant_id = r.restaurant_id
          ORDER BY ri.image_id DESC LIMIT 1
        ) AS cover_image
      FROM restaurants r
      LEFT JOIN reviews rv ON rv.restaurant_id = r.restaurant_id
      WHERE r.status = 'APPROVED'
      GROUP BY r.restaurant_id
      ORDER BY r.restaurant_id DESC
    `);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("MAP RESTAURANTS ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/restaurants/price-options
 * ✅ ต้องอยู่เหนือ /:id ไม่งั้น Express จะ match เป็น id="price-options"
 */
router.get("/price-options", async (req, res) => {
  try {
    const { foodtype_id } = req.query;

    let sql = `
      SELECT DISTINCT price_min, price_max
      FROM restaurants
      WHERE status = 'APPROVED'
    `;
    const params = [];

    if (foodtype_id) {
      sql += `
        AND EXISTS (
          SELECT 1 FROM restaurant_food_types rft
          WHERE rft.restaurant_id = restaurants.restaurant_id AND rft.foodtype_id = ?
        )
      `;
      params.push(Number(foodtype_id));
    }

    sql += " ORDER BY price_min ASC, price_max ASC";

    const [rows] = await pool.query(sql, params);

    const data = rows.map((row) => ({
      value: `${row.price_min}-${row.price_max}`,
      label: `${row.price_min} - ${row.price_max} บาท`,
      price_min: row.price_min,
      price_max: row.price_max,
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error("GET PRICE OPTIONS ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * GET /api/restaurants
 * Public — list ร้านทั้งหมด
 */
router.get("/", async (req, res) => {
  try {
    const status = req.query.status || "APPROVED";

    const [rows] = await pool.query(
      `SELECT
        r.restaurant_id, r.restaurant_name, r.description, r.address,
        r.latitude, r.longitude, r.open_time, r.close_time,
        r.price_min, r.price_max, r.owner_id, r.status, r.is_active,
        ${isOpenNowSql} AS is_open_now,
        ${foodTypesSql},
        COALESCE(AVG(CASE WHEN rv.review_status = 'APPROVED' THEN rv.rating END), 0) AS avg_rating,
        SUM(CASE WHEN rv.review_status = 'APPROVED' THEN 1 ELSE 0 END) AS review_count,
        (
          SELECT ri.image_url FROM restaurant_images ri
          WHERE ri.restaurant_id = r.restaurant_id
          ORDER BY ri.image_id DESC LIMIT 1
        ) AS cover_image
       FROM restaurants r
       LEFT JOIN reviews rv ON rv.restaurant_id = r.restaurant_id
       WHERE r.status = ?
       GROUP BY r.restaurant_id
       ORDER BY r.restaurant_id DESC`,
      [status]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("LIST RESTAURANTS ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Routes ที่ขึ้นต้นด้วย /images/ ต้องอยู่เหนือ /:id
// ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/restaurants/images/:imageId
 * ✅ ต้องอยู่เหนือ /:id ไม่งั้น Express จะ match เป็น id="images"
 */
router.delete("/images/:imageId", requireAuth, async (req, res) => {
  try {
    const imageId = Number(req.params.imageId);

    const [[image]] = await pool.query(
      `SELECT ri.image_id, ri.image_url, ri.restaurant_id, r.owner_id
       FROM restaurant_images ri
       JOIN restaurants r ON r.restaurant_id = ri.restaurant_id
       WHERE ri.image_id = ?`,
      [imageId]
    );

    if (!image) {
      return res.status(404).json({ ok: false, message: "ไม่พบรูปภาพนี้" });
    }

    const isAdmin = req.user.role === "ADMIN";
    const isOwner = req.user.role === "OWNER" && image.owner_id === req.user.user_id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ลบรูปภาพนี้" });
    }

    await pool.query("DELETE FROM restaurant_images WHERE image_id = ?", [imageId]);

    // ✅ ลบไฟล์จริงออกจาก disk
    if (image.image_url) {
      const filename = path.basename(image.image_url);
      const filepath = path.join(__dirname, "..", "uploads", filename);
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== "ENOENT") {
          console.error("DELETE FILE ERROR:", unlinkErr.message);
        }
      });
    }

    res.json({ ok: true, message: "ลบรูปภาพสำเร็จ" });
  } catch (err) {
    console.error("DELETE RESTAURANT IMAGE ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Dynamic routes /:id — ต้องอยู่ท้ายสุด
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/restaurants/:id/images
 */
router.get("/:id/images", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await pool.query(
      `SELECT image_id, restaurant_id, image_url, caption
       FROM restaurant_images
       WHERE restaurant_id = ?
       ORDER BY image_id DESC`,
      [id]
    );

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("GET RESTAURANT IMAGES ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/restaurants/:id/images/upload
 * ✅ เพิ่ม handleUploadError
 */
router.post(
  "/:id/images/upload",
  requireAuth,
  upload.single("image"),
  handleUploadError,
  async (req, res) => {
    try {
      const restaurantId = Number(req.params.id);

      const [[restaurant]] = await pool.query(
        "SELECT restaurant_id, owner_id FROM restaurants WHERE restaurant_id = ?",
        [restaurantId]
      );

      if (!restaurant) {
        return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
      }

      const isAdmin = req.user.role === "ADMIN";
      const isOwner =
        req.user.role === "OWNER" && restaurant.owner_id === req.user.user_id;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์อัปโหลดรูปให้ร้านนี้" });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, message: "กรุณาเลือกไฟล์รูป" });
      }

      const imageUrl = buildFileUrl(req, req.file.filename);
      const caption = req.body.caption || null;

      const [result] = await pool.query(
        "INSERT INTO restaurant_images (restaurant_id, image_url, caption) VALUES (?, ?, ?)",
        [restaurantId, imageUrl, caption]
      );

      res.json({ ok: true, image_id: result.insertId, image_url: imageUrl });
    } catch (err) {
      console.error("UPLOAD RESTAURANT IMAGE ERROR:", err);
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
 * GET /api/restaurants/:id
 * Public — ดูรายละเอียดร้าน
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[restaurant]] = await pool.query(
      `SELECT
        r.restaurant_id, r.restaurant_name, r.description, r.address,
        r.latitude, r.longitude, r.open_time, r.close_time,
        r.price_min, r.price_max, r.owner_id, r.status, r.is_active,
        ${isOpenNowSql} AS is_open_now,
        ${foodTypesSql}
       FROM restaurants r
       WHERE r.restaurant_id = ?`,
      [id]
    );

    if (!restaurant) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }

    const [menus] = await pool.query(
      `SELECT menu_id, restaurant_id, menu_name, description, price, image_url, is_available
       FROM menu WHERE restaurant_id = ? ORDER BY menu_id DESC`,
      [id]
    );

    const [reviews] = await pool.query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at, u.username
       FROM reviews r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.restaurant_id = ? AND r.review_status = 'APPROVED'
       ORDER BY r.review_id DESC`,
      [id]
    );

    const [images] = await pool.query(
      `SELECT image_id, restaurant_id, image_url, caption
       FROM restaurant_images WHERE restaurant_id = ? ORDER BY image_id DESC`,
      [id]
    );

    res.json({ ok: true, restaurant, menus, reviews, images });
  } catch (err) {
    console.error("GET RESTAURANT DETAIL ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/restaurants
 * OWNER เพิ่มร้าน → PENDING
 */
router.post("/", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const {
      restaurant_name,
      description,
      address,
      latitude,
      longitude,
      open_time,
      close_time,
      price_min,
      price_max,
      foodtype_ids, // array เช่น [1, 2, 3]
    } = req.body;

    if (!restaurant_name || !address || latitude == null || longitude == null || !open_time || !close_time) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลร้านไม่ครบ" });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    const priceMinNum = Number(price_min || 0);
    const priceMaxNum = Number(price_max || 0);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ ok: false, message: "latitude หรือ longitude ไม่ถูกต้อง" });
    }
    if (Number.isNaN(priceMinNum) || Number.isNaN(priceMaxNum)) {
      return res.status(400).json({ ok: false, message: "ราคาต้องเป็นตัวเลข" });
    }
    if (priceMinNum > priceMaxNum) {
      return res.status(400).json({ ok: false, message: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" });
    }

    const [result] = await pool.query(
      `INSERT INTO restaurants
       (restaurant_name, description, address, latitude, longitude,
        open_time, close_time, price_min, price_max, owner_id, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 1)`,
      [
        restaurant_name, description || null, address,
        latNum, lngNum, open_time, close_time,
        priceMinNum, priceMaxNum, req.user.user_id,
      ]
    );

    const restaurantId = result.insertId;

    // ✅ Insert food types (many-to-many)
    if (Array.isArray(foodtype_ids) && foodtype_ids.length > 0) {
      const ftValues = foodtype_ids.map((ftId) => [restaurantId, Number(ftId)]);
      await pool.query(
        "INSERT INTO restaurant_food_types (restaurant_id, foodtype_id) VALUES ?",
        [ftValues]
      );
    }

    res.json({ ok: true, restaurant_id: restaurantId });
  } catch (err) {
    console.error("CREATE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PUT /api/restaurants/:id/owner  ✅ เพิ่มใหม่
 * OWNER แก้ไขข้อมูลร้านตัวเอง
 */
router.put("/:id/owner", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      restaurant_name,
      description,
      address,
      latitude,
      longitude,
      open_time,
      close_time,
      price_min,
      price_max,
      foodtype_ids,
    } = req.body;

    const [[restaurant]] = await pool.query(
      "SELECT restaurant_id, owner_id FROM restaurants WHERE restaurant_id = ?",
      [id]
    );

    if (!restaurant) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }
    if (restaurant.owner_id !== req.user.user_id) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์แก้ไขร้านนี้" });
    }

    if (!restaurant_name || !address || latitude == null || longitude == null) {
      return res.status(400).json({ ok: false, message: "กรอกข้อมูลร้านไม่ครบ" });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    const priceMinNum = Number(price_min || 0);
    const priceMaxNum = Number(price_max || 0);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ ok: false, message: "latitude หรือ longitude ไม่ถูกต้อง" });
    }
    if (priceMinNum > priceMaxNum) {
      return res.status(400).json({ ok: false, message: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" });
    }

    await pool.query(
      `UPDATE restaurants
       SET restaurant_name = ?, description = ?, address = ?,
           latitude = ?, longitude = ?, open_time = ?, close_time = ?,
           price_min = ?, price_max = ?
       WHERE restaurant_id = ?`,
      [
        restaurant_name, description || null, address,
        latNum, lngNum,
        open_time || "08:00:00", close_time || "22:00:00",
        priceMinNum, priceMaxNum, id,
      ]
    );

    // ✅ Update food types — ลบเดิมแล้ว insert ใหม่
    await pool.query(
      "DELETE FROM restaurant_food_types WHERE restaurant_id = ?",
      [id]
    );
    if (Array.isArray(foodtype_ids) && foodtype_ids.length > 0) {
      const ftValues = foodtype_ids.map((ftId) => [id, Number(ftId)]);
      await pool.query(
        "INSERT INTO restaurant_food_types (restaurant_id, foodtype_id) VALUES ?",
        [ftValues]
      );
    }

    res.json({ ok: true, message: "แก้ไขข้อมูลร้านสำเร็จ" });
  } catch (err) {
    console.error("OWNER UPDATE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/restaurants/:id/toggle-active
 * OWNER toggle เปิด/ปิดร้าน
 */
router.patch("/:id/toggle-active", requireAuth, requireRole("OWNER"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[restaurant]] = await pool.query(
      "SELECT restaurant_id, owner_id, is_active FROM restaurants WHERE restaurant_id = ?",
      [id]
    );

    if (!restaurant) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }
    if (restaurant.owner_id !== req.user.user_id) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์จัดการร้านนี้" });
    }

    const newValue = restaurant.is_active ? 0 : 1;
    await pool.query(
      "UPDATE restaurants SET is_active = ? WHERE restaurant_id = ?",
      [newValue, id]
    );

    res.json({
      ok: true,
      is_active: newValue,
      message: newValue ? "เปิดร้านแล้ว" : "ปิดร้านแล้ว",
    });
  } catch (err) {
    console.error("TOGGLE RESTAURANT ACTIVE ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/restaurants/:id/approve
 * ADMIN อนุมัติร้าน
 */
router.patch("/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[rest]] = await pool.query(
      "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ?",
      [id]
    );
    if (!rest) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }

    await pool.query(
      "UPDATE restaurants SET status = 'APPROVED' WHERE restaurant_id = ?",
      [id]
    );
    res.json({ ok: true, message: "อนุมัติร้านสำเร็จ" });
  } catch (err) {
    console.error("APPROVE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/restaurants/:id/reject
 * ADMIN ปฏิเสธร้าน
 */
router.patch("/:id/reject", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[rest]] = await pool.query(
      "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ?",
      [id]
    );
    if (!rest) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }

    await pool.query(
      "UPDATE restaurants SET status = 'REJECTED' WHERE restaurant_id = ?",
      [id]
    );
    res.json({ ok: true, message: "ปฏิเสธร้านสำเร็จ" });
  } catch (err) {
    console.error("REJECT RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * POST /api/restaurants/admin
 * ADMIN สร้างร้านให้ owner
 */
router.post("/admin", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const {
      restaurant_name, description, address, latitude, longitude,
      open_time, close_time, price_min, price_max,
      owner_id, status, is_active, foodtype_ids,
    } = req.body;

    if (!restaurant_name || !address) {
      return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อร้านและที่อยู่" });
    }
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ ok: false, message: "ต้องระบุ latitude และ longitude" });
    }
    if (!owner_id) {
      return res.status(400).json({ ok: false, message: "ต้องระบุ owner_id" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const min = Number(price_min || 0);
    const max = Number(price_max || 0);
    const ownerIdNum = Number(owner_id);
    const safeIsActive = Number(is_active) === 0 ? 0 : 1;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ ok: false, message: "latitude / longitude ไม่ถูกต้อง" });
    }
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return res.status(400).json({ ok: false, message: "ราคาต้องเป็นตัวเลข" });
    }
    if (Number.isNaN(ownerIdNum)) {
      return res.status(400).json({ ok: false, message: "owner_id ไม่ถูกต้อง" });
    }
    if (min > max) {
      return res.status(400).json({ ok: false, message: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" });
    }

    const [[owner]] = await pool.query(
      "SELECT user_id, role FROM users WHERE user_id = ?",
      [ownerIdNum]
    );
    if (!owner) {
      return res.status(404).json({ ok: false, message: "ไม่พบ owner_id นี้ในระบบ" });
    }
    if (owner.role !== "OWNER") {
      return res.status(400).json({ ok: false, message: "user นี้ไม่ได้เป็น OWNER" });
    }

    const safeStatus =
      status === "PENDING" || status === "REJECTED" || status === "APPROVED"
        ? status : "APPROVED";

    const [result] = await pool.query(
      `INSERT INTO restaurants
       (restaurant_name, description, address, latitude, longitude,
        open_time, close_time, price_min, price_max, owner_id, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        restaurant_name, description || null, address,
        lat, lng,
        open_time || "08:00:00", close_time || "22:00:00",
        min, max, ownerIdNum, safeStatus, safeIsActive,
      ]
    );

    const restaurantId = result.insertId;

    if (Array.isArray(foodtype_ids) && foodtype_ids.length > 0) {
      const ftValues = foodtype_ids.map((ftId) => [restaurantId, Number(ftId)]);
      await pool.query(
        "INSERT INTO restaurant_food_types (restaurant_id, foodtype_id) VALUES ?",
        [ftValues]
      );
    }

    res.json({ ok: true, restaurant_id: restaurantId });
  } catch (err) {
    console.error("ADMIN CREATE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * PATCH /api/restaurants/:id
 * ADMIN แก้ไขข้อมูลร้าน
 */
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      restaurant_name, description, address, latitude, longitude,
      open_time, close_time, price_min, price_max,
      owner_id, status, is_active, foodtype_ids,
    } = req.body;

    if (!restaurant_name || !address) {
      return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อร้านและที่อยู่" });
    }
    if (!owner_id) {
      return res.status(400).json({ ok: false, message: "ต้องระบุ owner_id" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const min = Number(price_min || 0);
    const max = Number(price_max || 0);
    const ownerIdNum = Number(owner_id);
    const safeIsActive = Number(is_active) === 0 ? 0 : 1;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ ok: false, message: "latitude / longitude ไม่ถูกต้อง" });
    }
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return res.status(400).json({ ok: false, message: "ราคาต้องเป็นตัวเลข" });
    }
    if (Number.isNaN(ownerIdNum)) {
      return res.status(400).json({ ok: false, message: "owner_id ไม่ถูกต้อง" });
    }
    if (min > max) {
      return res.status(400).json({ ok: false, message: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" });
    }

    const [[owner]] = await pool.query(
      "SELECT user_id, role FROM users WHERE user_id = ?",
      [ownerIdNum]
    );
    if (!owner) {
      return res.status(404).json({ ok: false, message: "ไม่พบ owner_id นี้ในระบบ" });
    }
    if (owner.role !== "OWNER") {
      return res.status(400).json({ ok: false, message: "user นี้ไม่ได้เป็น OWNER" });
    }

    const safeStatus =
      status === "PENDING" || status === "REJECTED" || status === "APPROVED"
        ? status : "APPROVED";

    await pool.query(
      `UPDATE restaurants
       SET restaurant_name = ?, description = ?, address = ?,
           latitude = ?, longitude = ?, open_time = ?, close_time = ?,
           price_min = ?, price_max = ?, owner_id = ?, status = ?, is_active = ?
       WHERE restaurant_id = ?`,
      [
        restaurant_name, description || null, address,
        lat, lng,
        open_time || "08:00:00", close_time || "22:00:00",
        min, max, ownerIdNum, safeStatus, safeIsActive, id,
      ]
    );

    // ✅ Update food types
    await pool.query(
      "DELETE FROM restaurant_food_types WHERE restaurant_id = ?",
      [id]
    );
    if (Array.isArray(foodtype_ids) && foodtype_ids.length > 0) {
      const ftValues = foodtype_ids.map((ftId) => [id, Number(ftId)]);
      await pool.query(
        "INSERT INTO restaurant_food_types (restaurant_id, foodtype_id) VALUES ?",
        [ftValues]
      );
    }

    res.json({ ok: true, message: "แก้ไขร้านสำเร็จ" });
  } catch (err) {
    console.error("ADMIN UPDATE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

/**
 * DELETE /api/restaurants/:id
 * ADMIN ลบร้าน (cascade ทุก related data)
 */
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[rest]] = await pool.query(
      "SELECT restaurant_id FROM restaurants WHERE restaurant_id = ?",
      [id]
    );
    if (!rest) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านนี้" });
    }

    await pool.query("DELETE FROM restaurant_food_types WHERE restaurant_id = ?", [id]);
    await pool.query("DELETE FROM restaurant_images WHERE restaurant_id = ?", [id]);
    await pool.query("DELETE FROM menu WHERE restaurant_id = ?", [id]);
    await pool.query("DELETE FROM reviews WHERE restaurant_id = ?", [id]);
    await pool.query("DELETE FROM restaurants WHERE restaurant_id = ?", [id]);

    res.json({ ok: true, message: "ลบร้านสำเร็จ" });
  } catch (err) {
    console.error("DELETE RESTAURANT ERROR:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.code || err.message,
      sqlMessage: err.sqlMessage || null,
    });
  }
});

module.exports = router;