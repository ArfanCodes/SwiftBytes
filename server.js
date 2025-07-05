const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const path = require("path");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Vonage } = require("@vonage/server-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config(); // Load environment variables first
const cors = require("cors");

// --- AWS SDK v3 Imports ---
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // For parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// --- Database Connections ---
// Initialize the main DB pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render or other cloud DBs
  },
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to main DB:", err.stack);
    return;
  }
  console.log("Connected to PostgreSQL main database.");

  // Create Inventory table if it doesn't exist
  // Added on July 5, 2025
  db.query(
    `
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `,
    (err, result) => {
      if (err) {
        console.error("Error creating inventory table:", err.stack);
      } else {
        console.log("Inventory table ready.");
      }
    }
  );
});

// Transaction DB (separate pool for orders)
const orderPool = new Pool({
  connectionString: process.env.DATABASE_URL, // Using the same DATABASE_URL for consistency
  ssl: { rejectUnauthorized: false }, // Important for Render hosted DB
});

orderPool.connect((err, client, release) => {
  if (err) {
    console.error("Error connecting to orders DB:", err.stack);
    return;
  }
  console.log("Connected to PostgreSQL orders database.");

  client.query(
    `
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            item TEXT,
            phone TEXT,
            amount REAL,
            date TEXT,
            time TEXT,
            status TEXT DEFAULT 'pending',
            token TEXT,
            payment_id TEXT,
            payment_status TEXT DEFAULT 'pending',
            priority_level TEXT DEFAULT 'normal'
        );
        `,
    (err, result) => {
      release(); // always release the client back to the pool

      if (err) {
        console.error("Error creating orders table:", err.stack);
      } else {
        console.log("Orders table ready.");
      }
    }
  );
});

// --- Session Configuration ---
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "super-secret-default-key-please-change-me", // Get secret from .env
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something is stored
    cookie: {
      httpOnly: true, // Prevent client-side JS access to the cookie
      sameSite: "lax", // Protects against some CSRF attacks
      maxAge: 5 * 60 * 1000, // 5 minutes, refreshes with 'rolling'
    },
    rolling: true, // This refreshes the cookie's maxAge on each request
  })
);

// --- Middleware ---
function isAuthenticated(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  // Session expired or invalid, destroy and redirect
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

// --- AWS S3 Configuration ---
// Initialize S3 Client (for SDK v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// --- MULTER-S3 SETUP (for SDK v3) ---
const upload = multer({
  storage: multerS3({
    s3: s3Client, // Pass the v3 S3Client instance here
    bucket: process.env.S3_BUCKET_NAME,
    acl: "public-read", // Still works for public access
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically detect content type
    key: function (req, file, cb) {
      // Define the filename in S3 (e.g., menu-items/timestamp-original-name.ext)
      cb(null, `menu-items/${Date.now().toString()}-${file.originalname}`);
    },
  }),
});

// Helper function to extract S3 key from a given URL or path
function extractS3Key(imageUrl) {
  const s3BucketName = process.env.S3_BUCKET_NAME;
  const s3Region = process.env.AWS_REGION;
  // Construct the standard S3 URL base
  const s3BaseUrl = `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/`;

  if (imageUrl.startsWith(s3BaseUrl)) {
    // If it's a full S3 URL (e.g., https://your-bucket.s3.region.amazonaws.com/menu-items/...)
    return imageUrl.substring(s3BaseUrl.length);
  } else if (
    imageUrl.startsWith("images/") ||
    imageUrl.startsWith("menu-items/")
  ) {
    // If it's a relative path (e.g., images/VegBurger.webp or menu-items/image.png)
    return imageUrl;
  }
  // Return null if the format isn't recognized or it's not an S3 image
  console.warn(`[extractS3Key] Unrecognized image URL format: ${imageUrl}`);
  return null;
}

// --- Vonage and Gemini API Initialization ---
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY, // From .env
  apiSecret: process.env.VONAGE_API_SECRET, // From .env
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // From .env

// --- View Engine Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname)); // views folder = current folder
app.use(express.static(__dirname)); // Serve static files from current directory

// --- API Endpoints ---

// ✅ New: Endpoint to provide S3 config to client-side
app.get("/api/s3-config", (req, res) => {
  // These values are safe to expose
  res.json({
    bucketName: process.env.S3_BUCKET_NAME,
    region: process.env.AWS_REGION,
  });
});

// Admin Login
const adminuser = "admin@site.com";
const adminPasswordHash = bcrypt.hashSync("admin@123*", 10); // Hash a default password for admin

app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null, username: "" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === adminuser) {
    bcrypt.compare(password, adminPasswordHash, (err, result) => {
      if (err) {
        console.error("Bcrypt error:", err);
        return res.render("login", { error: "An error occurred.", username });
      }

      if (result) {
        req.session.user = username;
        req.session.isAuthenticated = true;
        res.redirect("/orders");
      } else {
        res.render("login", { error: "Invalid admin credentials.", username });
      }
    });
  } else {
    res.render("login", { error: "Invalid admin credentials.", username });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error logging out:", err);
      return res.status(500).send("Error logging out.");
    }
    res.clearCookie("connect.sid"); // Clear the session cookie
    res.redirect("/login");
  });
});

app.get("/check-auth", (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.sendStatus(200); // User is authenticated
  } else {
    res.sendStatus(401); // User is not authenticated
  }
});

app.get("/get-razorpay-key", (req, res) => {
  res.send({ key: process.env.RAZORPAY_KEY_ID }); // From .env
});

// --- HTML Page Routes (Authenticated) ---
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/menued", isAuthenticated, (req, res) => {
  res.setHeader("Cache-Control", "no-store"); // Prevent caching of sensitive content
  res.sendFile(path.join(__dirname, "menued.html"));
});

app.get("/inventory", isAuthenticated, (req, res) => {
  res.setHeader("Cache-Control", "no-store"); // Prevent caching of sensitive content
  res.sendFile(path.join(__dirname, "inventory.html"));
});

app.get("/orders", isAuthenticated, (req, res) => {
  res.setHeader("Cache-Control", "no-store"); // Prevents browser from caching
  res.sendFile(path.join(__dirname, "orders.html"));
});

app.get("/insights", isAuthenticated, (req, res) => {
  res.setHeader("Cache-Control", "no-store"); // Prevents browser from caching
  res.sendFile(path.join(__dirname, "insights.html"));
});

// --- Menu Item API Routes ---

// Fetch all menu items
app.get("/menu", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM menu_items ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching menu items:", err);
    res.status(500).send("Failed to fetch menu items");
  }
});

// Add new item with S3 image upload
// 'imageFile' is the 'name' attribute of your file input in the HTML form
app.post("/menu", upload.single("imageFile"), (req, res) => {
  const { name, price } = req.body;
  let imageUrl = null; // This will store the S3 URL

  if (req.file) {
    // If an image was uploaded successfully to S3, its URL is in req.file.location
    imageUrl = req.file.location;
  } else {
    // As per the screenshot, "Image file is required for new menu item."
    return res
      .status(400)
      .json({ error: "Image file is required for new menu item." });
  }

  const sql = `INSERT INTO menu_items (name, price, image) VALUES ($1, $2, $3) RETURNING *`;
  const values = [name, price, imageUrl]; // Store the S3 URL in the database

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding item to DB:", err);
      // Optionally, if the DB insert fails, consider deleting the image from S3
      // to avoid orphaned S3 objects.
      if (imageUrl) {
        const s3Key = extractS3Key(imageUrl);
        if (s3Key) {
          s3Client
            .send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: s3Key,
              })
            )
            .then(() => console.log(`Orphaned S3 object deleted: ${s3Key}`))
            .catch((deleteErr) =>
              console.error(
                `Error deleting orphaned S3 object: ${s3Key}`,
                deleteErr
              )
            );
        }
      }
      return res.status(500).json({ error: "Failed to add item." });
    }
    res.status(201).json(result.rows[0]);
  });
});

// ✅ Combined PUT route for updating menu item (with optional image update)
app.put("/menu/:id", upload.single("imageFile"), async (req, res) => {
  const { name, price } = req.body;
  const { id } = req.params;
  let imageUrlToSave = null; // This will be the final image URL to save to the DB

  try {
    // Fetch the current item's image URL from the database
    const existingItemResult = await db.query(
      "SELECT image FROM menu_items WHERE id = $1",
      [id]
    );
    if (existingItemResult.rows.length === 0) {
      return res.status(404).json({ error: "Item not found." });
    }
    const currentDbImageUrl = existingItemResult.rows[0].image;

    // Case 1: A new file was uploaded via the form
    if (req.file) {
      imageUrlToSave = req.file.location; // Multer-S3 provides the full URL

      // Optional: Delete the old image from S3 if a new one is uploaded
      if (currentDbImageUrl) {
        const s3KeyToDelete = extractS3Key(currentDbImageUrl); // Use helper function
        if (s3KeyToDelete) {
          const deleteParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3KeyToDelete,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log(
              "Old image successfully deleted from S3:",
              s3KeyToDelete
            );
          } catch (s3Err) {
            if (s3Err.name === "NoSuchKey") {
              console.warn(
                `S3 object not found for key: ${s3KeyToDelete}. Proceeding with update.`
              );
            } else {
              console.error(
                "Error deleting old image from S3 during PUT:",
                s3Err
              );
            }
          }
        }
      }
    }
    // Case 2: No new file uploaded, but the frontend indicates to clear the image
    else if (req.body.clearImage === "true") {
      imageUrlToSave = null; // Set to null to remove from DB
      if (currentDbImageUrl) {
        const s3KeyToDelete = extractS3Key(currentDbImageUrl); // Use helper function
        if (s3KeyToDelete) {
          const deleteParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3KeyToDelete,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
            console.log(
              "Image successfully deleted from S3 during clear operation:",
              s3KeyToDelete
            );
          } catch (s3Err) {
            if (s3Err.name === "NoSuchKey") {
              console.warn(
                `S3 object not found for key during clear: ${s3KeyToDelete}. Proceeding with update.`
              );
            } else {
              console.error(
                "Error deleting image from S3 during clear operation:",
                s3Err
              );
            }
          }
        }
      }
    }
    // Case 3: No new file uploaded, and no explicit instruction to clear
    else {
      imageUrlToSave = currentDbImageUrl; // Retain the existing image URL from the DB
    }

    const sql = `UPDATE menu_items SET name = $1, price = $2, image = $3 WHERE id = $4 RETURNING *`;
    const values = [name, price, imageUrlToSave, id];

    const result = await db.query(sql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found." });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating item:", err);
    // If Multer error (e.g., 'Unexpected field'), handle it specifically
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: `Unexpected field: ${err.field}. Please ensure you are sending the correct file field.`,
      });
    }
    res.status(500).json({ error: "Failed to update item." });
  }
});

// Delete item (with S3 image deletion)
app.delete("/menu/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`[DELETE /menu/${id}] Request received to delete item.`);

  try {
    let s3KeyToDelete = null;

    // 1. Retrieve the item details from the DB to get the image URL
    console.log(`[DELETE /menu/${id}] Querying DB for image URL...`);
    const imageResult = await db.query(
      "SELECT image FROM menu_items WHERE id = $1",
      [id]
    );
    console.log(`[DELETE /menu/${id}] DB query result:`, imageResult.rows);

    if (imageResult.rows.length > 0 && imageResult.rows[0].image) {
      const imageUrl = imageResult.rows[0].image;
      console.log(`[DELETE /menu/${id}] Retrieved image URL:`, imageUrl);
      s3KeyToDelete = extractS3Key(imageUrl); // Use helper function
      console.log(
        `[DELETE /menu/${id}] Determined S3 Key to delete:`,
        s3KeyToDelete
      );
    } else {
      console.log(
        `[DELETE /menu/${id}] No image associated with item ID ${id} or item not found initially.`
      );
    }

    // 2. Attempt to delete the image from S3 (if a key was found)
    if (s3KeyToDelete) {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3KeyToDelete,
      };
      console.log(
        `[DELETE /menu/${id}] Attempting S3 delete with params:`,
        params
      );

      try {
        await s3Client.send(new DeleteObjectCommand(params));
        console.log(
          `[DELETE /menu/${id}] Image successfully deleted from S3: ${s3KeyToDelete}`
        );
      } catch (s3Err) {
        if (s3Err.name === "NoSuchKey") {
          console.warn(
            `[DELETE /menu/${id}] S3 object not found for key: ${s3KeyToDelete}. Proceeding with DB deletion.`
          );
        } else {
          console.error(
            `[DELETE /menu/${id}] Error deleting image from S3:`,
            s3Err
          );
        }
      }
    }

    // 3. Then, delete the item from the database
    console.log(`[DELETE /menu/${id}] Deleting item from DB...`);
    const dbResult = await db.query("DELETE FROM menu_items WHERE id = $1", [
      id,
    ]);
    console.log(
      `[DELETE /menu/${id}] DB deletion result:`,
      dbResult.rowCount,
      "rows deleted."
    );

    if (dbResult.rowCount === 0) {
      console.warn(
        `[DELETE /menu/${id}] Item with ID ${id} not found in database for deletion.`
      );
      return res.status(404).send("Item not found in database.");
    }

    // 4. Send success response (204 No Content is preferred for DELETE)
    res.sendStatus(204);
    console.log(
      `[DELETE /menu/${id}] Item ID ${id} successfully deleted from DB and S3 (if image existed).`
    );
  } catch (err) {
    console.error(`[DELETE /menu/${id}] Critical error deleting item:`, err);
    res
      .status(500)
      .send("Failed to delete item due to an internal server error.");
  }
});

// --- New Inventory API Routes (Added on July 5, 2025) ---

// Get all inventory items
app.get("/api/inventory", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM inventory ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  }
});

// Add a new inventory item
app.post("/api/inventory", async (req, res) => {
  const { name, price, quantity } = req.body;
  if (!name || price === undefined || quantity === undefined) {
    // Check for undefined to allow 0
    return res
      .status(400)
      .json({ error: "Missing required fields: name, price, quantity" });
  }
  if (isNaN(parseFloat(price)) || isNaN(parseInt(quantity))) {
    return res
      .status(400)
      .json({ error: "Price and quantity must be valid numbers." });
  }
  try {
    const result = await db.query(
      "INSERT INTO inventory (name, price, quantity) VALUES ($1, $2, $3) RETURNING *",
      [name, parseFloat(price), parseInt(quantity)] // Ensure correct types for DB
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding inventory item:", err);
    res.status(500).json({ error: "Failed to add item", details: err.message });
  }
});

// Update an inventory item
app.put("/api/inventory/:id", async (req, res) => {
  const { id } = req.params;
  const { name, price, quantity } = req.body;

  if (name === undefined && price === undefined && quantity === undefined) {
    return res.status(400).json({ error: "No fields provided for update" });
  }

  // Build dynamic query for update
  let queryParts = [];
  let queryValues = [];
  let paramIndex = 1;

  if (name !== undefined) {
    queryParts.push(`name = $${paramIndex++}`);
    queryValues.push(name);
  }
  if (price !== undefined) {
    if (isNaN(parseFloat(price))) {
      return res.status(400).json({ error: "Price must be a valid number." });
    }
    queryParts.push(`price = $${paramIndex++}`);
    queryValues.push(parseFloat(price));
  }
  if (quantity !== undefined) {
    if (isNaN(parseInt(quantity))) {
      return res
        .status(400)
        .json({ error: "Quantity must be a valid number." });
    }
    queryParts.push(`quantity = $${paramIndex++}`);
    queryValues.push(parseInt(quantity));
  }

  queryParts.push(`updated_at = CURRENT_TIMESTAMP`); // Always update timestamp

  queryValues.push(id); // ID is the last parameter

  const queryText = `UPDATE inventory SET ${queryParts.join(
    ", "
  )} WHERE id = $${paramIndex} RETURNING *`;

  try {
    const result = await db.query(queryText, queryValues);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating inventory item ${id}:`, err);
    res
      .status(500)
      .json({ error: "Failed to update item", details: err.message });
  }
});

// Delete an inventory item
app.delete("/api/inventory/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM inventory WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json({ message: `Item ${id} deleted successfully` });
  } catch (err) {
    console.error(`Error deleting inventory item ${id}:`, err);
    res
      .status(500)
      .json({ error: "Failed to delete item", details: err.message });
  }
});

// --- Order Processing API Routes ---

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

app.post("/place-order", async (req, res) => {
  let { cart, phone, payment_id, priority_level } = req.body;

  if (!cart || !phone || !payment_id) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric", // 'numeric', '2-digit'
    minute: "2-digit", // 'numeric', '2-digit'
    hour12: true, // true for 12-hour format, false for 24-hour format
  });
  const token = generateToken();

  const itemsSummary = cart
    .map((item) => `${item.name} X ${item.quantity}`)
    .join("\n");
  const totalAmount = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  const query = `
        INSERT INTO orders (item, phone, amount, date, time, token, payment_id, payment_status, priority_level)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id;
    `;

  try {
    const result = await orderPool.query(query, [
      itemsSummary,
      phone,
      totalAmount,
      date,
      time,
      token,
      payment_id,
      "paid",
      priority_level,
    ]);

    const orderId = result.rows[0].id;

    const to = phone.startsWith("+") ? phone : `+91${phone}`;
    const from = "SwiftBites"; // This could also come from .env if needed
    const text = `Your order has been placed and payment received! Your order token is: ${token}. We'll notify you when it's ready.`;

    vonage.sms
      .send({ to, from, text })
      .then(() => console.log("Confirmation SMS sent"))
      .catch((error) => console.error("Vonage SMS error:", error));

    res.json({
      success: true,
      token: token,
      message: "Payment verified and order confirmed!",
      orderId: orderId,
    });
  } catch (err) {
    console.error("PostgreSQL insert error:", err);
    res.status(500).json({ error: "Failed to save order" });
  }
});

// Fetch all orders
app.get("/api/orders", async (req, res) => {
  try {
    const result = await orderPool.query(`
            SELECT * FROM orders
            ORDER BY
                status = 'pending' DESC,
                priority_level DESC
        `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Mark as Prepared
app.post("/mark-prepared/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const result = await orderPool.query(
      `SELECT phone, item, token FROM orders WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    await orderPool.query(
      `UPDATE orders SET status = 'prepared' WHERE id = $1`,
      [id]
    );

    res.json({ message: "Order marked as prepared.", order: result.rows[0] });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Failed to mark order as prepared." });
  }
});

// Mark as Picked Up
app.post("/mark-pickedup/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const result = await orderPool.query(
      `UPDATE orders SET status = 'pickedup' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.json({ message: "Order marked as picked up.", order: result.rows[0] });
  } catch (err) {
    console.error("Pickedup error:", err);
    res.status(500).json({ message: "Failed to update order." });
  }
});

// --- AI Insights API ---
app.get("/api/order-insights", async (req, res) => {
  try {
    const result = await orderPool.query(
      "SELECT * FROM orders ORDER BY id DESC"
    );
    const orders = result.rows;

    if (orders.length === 0) {
      return res.json({
        insights: "No orders found. Place some orders to generate insights.",
      });
    }

    try {
      const insights = generateLocalInsights(orders);
      res.json({ insights });
    } catch (error) {
      console.error("Error generating insights:", error);
      const basicInsights = generateBasicStats(orders);
      res.json({ insights: basicInsights });
    }
  } catch (err) {
    console.error("Database error fetching orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Function to generate insights locally without API
function generateLocalInsights(orders) {
  const totalRevenue = orders
    .reduce((sum, order) => sum + parseFloat(order.amount), 0)
    .toFixed(2);

  const itemCounts = {};
  orders.forEach((order) => {
    // Assuming order.item might contain multiple items separated by '\n' or similar
    // If 'item' is a single string like "Item1 X 2\nItem2 X 1", you might need to parse it more robustly
    // For simplicity, this assumes `order.item` is the item name or a unique identifier.
    // If it's a summary, this counting won't be accurate for individual items.
    // For this example, let's just count the entire 'item' string from the DB.
    itemCounts[order.item] = (itemCounts[order.item] || 0) + 1;
  });

  const sortedItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([item, count]) => ({ item, count }));

  const topItems = sortedItems.slice(0, Math.min(3, sortedItems.length));

  const averageOrderValue =
    orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : 0;

  const ordersByStatus = {
    pending: orders.filter((o) => o.status === "pending").length,
    prepared: orders.filter((o) => o.status === "prepared").length,
    pickedup: orders.filter((o) => o.status === "pickedup").length,
  };

  const ordersByPayment = {
    pending: orders.filter((o) => o.payment_status === "pending").length,
    completed: orders.filter((o) => o.payment_status === "paid").length,
  };

  let insights = `# Business Insights Report\n\n`;

  insights += `## Order Summary\n`;
  insights += `- Total Orders: ${orders.length}\n`;
  insights += `- Total Revenue: ₹${totalRevenue}\n`;
  insights += `- Average Order Value: ₹${averageOrderValue}\n\n`;

  insights += `## Top Selling Items\n`;
  if (topItems.length === 0) {
    insights += `- No top selling items yet.\n`;
  } else {
    topItems.forEach((item, index) => {
      insights += `${index + 1}. ${item.item} (${item.count} orders)\n`;
    });
  }
  insights += `\n`;

  insights += `## Order Status Breakdown\n`;
  insights += `- Pending: ${ordersByStatus.pending}\n`;
  insights += `- Prepared: ${ordersByStatus.prepared}\n`;
  insights += `- Picked Up: ${ordersByStatus.pickedup}\n\n`;

  insights += `## Payment Status Breakdown\n`;
  insights += `- Payment Pending: ${ordersByPayment.pending}\n`;
  insights += `- Payment Completed: ${ordersByPayment.completed}\n\n`;

  insights += `## Recommendations\n`;

  if (topItems.length > 0) {
    insights += `- Consider promoting your top seller "${topItems[0].item}" more prominently.\n`;
  } else {
    insights += `- No specific top seller to recommend promotion for yet.\n`;
  }

  if (
    ordersByStatus.pending > ordersByStatus.prepared * 2 &&
    ordersByStatus.pending > 0
  ) {
    insights += `- The kitchen might need more staff as there are many pending orders.\n`;
  } else if (ordersByStatus.pending === 0 && orders.length > 0) {
    insights += `- Excellent job, all orders are being processed efficiently!\n`;
  }

  if (orders.length > 0) {
    if (parseFloat(averageOrderValue) < 15) {
      // Use parseFloat for numerical comparison
      insights += `- Try offering combo deals to increase average order value.\n`;
    } else {
      insights += `- Your average order value is good, consider loyalty rewards for repeat customers.\n`;
    }

    if (
      ordersByPayment.pending > ordersByPayment.completed * 0.5 &&
      ordersByPayment.pending > 0
    ) {
      insights += `- Review your payment process, many customers are abandoning payment.\n`;
    } else {
      insights += `- Your payment completion rate is excellent!\n`;
    }
  } else {
    insights += `- Start by gathering more order data to generate meaningful recommendations.\n`;
  }

  return insights;
}

// Fallback function to generate basic stats if even local insights generation fails
function generateBasicStats(orders) {
  const totalRevenue = orders
    .reduce((sum, order) => sum + parseFloat(order.amount), 0)
    .toFixed(2);
  const completedPayments = orders.filter(
    (o) => o.payment_status === "paid"
  ).length;
  return `Total Orders: ${orders.length}\nTotal Revenue: $${totalRevenue}\nCompleted Payments: ${completedPayments}`;
}

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
