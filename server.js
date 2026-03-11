// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const { testConnection } = require("./config/db");

// ── Routes ───────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const restaurantRoutes = require("./routes/restaurants");
const reviewRoutes = require("./routes/reviews");
const menuRoutes = require("./routes/menu");
const imageRoutes = require("./routes/images");
const restaurantImageRoutes = require("./routes/restaurant_images");
const userRoutes = require("./routes/users");
const categoryRoutes = require("./routes/categories");

// ── Environment check ────────────────────────────────────────
const requiredEnv = ["JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// ── Middleware ───────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://project-restaurant-search-fn.vercel.app",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ─────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Health check ─────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Restaurant API is running",
    environment: process.env.NODE_ENV || "development",
  });
});

// ── Mount routes ─────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/restaurant-images", restaurantImageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("❌ UNHANDLED SERVER ERROR:", err);

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || "Internal server error",
  });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    console.log("⏳ Starting server...");
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔌 PORT: ${PORT}`);
    console.log(`🌐 FRONTEND_URL: ${process.env.FRONTEND_URL || "https://project-restaurant-search-fn.vercel.app"}`);
    console.log(`🔑 JWT_SECRET exists: ${!!process.env.JWT_SECRET}`);

    await testConnection();
    console.log("✅ Database connected successfully");

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error("❌ Server error:", err.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error("Reason:", error.message);
    process.exit(1);
  }
}

startServer();