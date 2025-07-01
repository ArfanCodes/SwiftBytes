const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Vonage } = require('@vonage/server-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;  // ✅ This is the fix

app.use(cors());
app.use(express.json());

// Your routes and DB logic here...
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
    // ❌ don't set maxAge here
  }
}));


function isAuthenticated(req, res, next) {
  const maxSessionAge = 5 * 60 * 1000; // ⏱️ 5 minutes session expiry

  if (
    req.session &&
    req.session.isAuthenticated &&
    req.session.createdAt &&
    Date.now() - req.session.createdAt < maxSessionAge
  ) {
    return next(); // ✅ Session is still valid
  }

  // ❌ Session expired or invalid
  req.session.destroy(() => {
    res.redirect("/login");
  });
}




app.get('/get-razorpay-key', (req, res) => {
  res.send({ key: process.env.RAZORPAY_KEY_ID });
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});


const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render
  },
});

db.connect();

// Add new item
app.post("/menu", (req, res) => {
  const { name, price, image } = req.body;

  const sql = `INSERT INTO menu_items (name, price, image) VALUES ($1, $2, $3) RETURNING *`;
  const values = [name, price, image];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding item:", err);
      return res.status(500).json({ error: "Failed to add item." });
    }
    res.status(201).json(result.rows[0]);
  });
});

// Edit item
app.put("/menu/:id", async (req, res) => {
  const { name, price, image } = req.body;
  const { id } = req.params;
  await db.query(
    "UPDATE menu_items SET name = $1, price = $2, image = $3 WHERE id = $4",
    [name, price, image, id]
  );
  res.sendStatus(200);
});

// Delete item
app.delete("/menu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM menu_items WHERE id = $1", [id]);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to delete item");
  }
});

app.put("/menu/:id", (req, res) => {
  const { id } = req.params;
  const { name, price, image } = req.body;

  const sql = `UPDATE menu_items SET name = $1, price = $2, image = $3 WHERE id = $4 RETURNING *`;
  const values = [name, price, image, id];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating item:", err);
      return res.status(500).json({ error: "Failed to update item." });
    }
    res.json(result.rows[0]);
  });
});

app.listen(3000, () => console.log("Server running on port 3000"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Important for Render hosted DB
});
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});


// Initialize Google Gemini API with the correct key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models are listed at: https://ai.google.dev/models/gemini

app.use(express.json()); // to parse JSON request bodies
app.use(bodyParser.urlencoded({ extended: true })); // to parse URL-encoded bodies

app.set("view engine", "ejs");
app.set("views", path.join(__dirname)); // views folder = current folder

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Hardcoded Admin Credentials
const adminuser = "admin@site.com";
const adminPasswordHash = bcrypt.hashSync("admin123", 10);

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.send("Error logging out.");
    }
    res.clearCookie('connect.sid'); // Clear the session cookie
    res.redirect('/login');
  });
});


app.get("/login", (req, res) => {
  res.render("login.ejs", { error: null, username: "" });
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/menued", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "menued.html"));
});


app.get("/inventory", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "inventory.html"));
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
        req.session.createdAt = Date.now(); // ✅ session timestamp
        res.redirect("/orders");
      } else {
        res.render("login", { error: "Invalid admin credentials.", username });
      }
    });
  } else {
    res.render("login", { error: "Invalid admin credentials.", username });
  }
});



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Transaction DB

const orderPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render
  },
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
      payment_status TEXT DEFAULT 'pending'
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

function generateToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

app.post("/place-order", async (req, res) => {
  let { cart, phone, payment_id, priority_level } = req.body; // added priority_level

  if (!cart || !phone || !payment_id) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const now = new Date();
  const date = now.toLocaleDateString("en-GB");
  const time = now.toLocaleTimeString("en-GB");
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
    const result = await pool.query(query, [
      itemsSummary,
      phone,
      totalAmount,
      date,
      time,
      token,
      payment_id,
      "paid",
      priority_level, // insert priority
    ]);

    const orderId = result.rows[0].id;

    const to = phone.startsWith("+") ? phone : `+91${phone}`;
    const from = "SwiftBites";
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
    const result = await pool.query(`
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

// AI Insights API
app.get("/api/order-insights", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
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
  // Calculate total revenue
  const totalRevenue = orders
    .reduce((sum, order) => sum + parseFloat(order.amount), 0)
    .toFixed(2);

  // Count items and find top sellers
  const itemCounts = {};
  orders.forEach((order) => {
    itemCounts[order.item] = (itemCounts[order.item] || 0) + 1;
  });

  // Sort items by frequency
  const sortedItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([item, count]) => ({ item, count }));

  // Get top 3 items (or less if fewer exist)
  const topItems = sortedItems.slice(0, Math.min(3, sortedItems.length));

  // Calculate average order value
  const averageOrderValue = (totalRevenue / orders.length).toFixed(2);

  // Count orders by status
  const ordersByStatus = {
    pending: orders.filter((o) => o.status === "pending").length,
    prepared: orders.filter((o) => o.status === "prepared").length,
    pickedup: orders.filter((o) => o.status === "pickedup").length,
  };

  // Count orders by payment status
  const ordersByPayment = {
    pending: orders.filter((o) => o.payment_status === "pending").length,
    completed: orders.filter((o) => o.payment_status === "completed").length,
  };

  // Build insights string
  let insights = `# Business Insights Report\n\n`;

  insights += `## Order Summary\n`;
  insights += `- Total Orders: ${orders.length}\n`;
  insights += `- Total Revenue: ₹${totalRevenue}\n`;
  insights += `- Average Order Value: ₹${averageOrderValue}\n\n`;

  insights += `## Top Selling Items\n`;
  topItems.forEach((item, index) => {
    insights += `${index + 1}. ${item.item} (${item.count} orders)\n`;
  });
  insights += `\n`;

  insights += `## Order Status Breakdown\n`;
  insights += `- Pending: ${ordersByStatus.pending}\n`;
  insights += `- Prepared: ${ordersByStatus.prepared}\n`;
  insights += `- Picked Up: ${ordersByStatus.pickedup}\n\n`;

  insights += `## Payment Status Breakdown\n`;
  insights += `- Payment Pending: ${ordersByPayment.pending}\n`;
  insights += `- Payment Completed: ${ordersByPayment.completed}\n\n`;

  insights += `## Recommendations\n`;

  // Add recommendations based on the data
  if (topItems.length > 0) {
    insights += `- Consider promoting your top seller "${topItems[0].item}" more prominently\n`;
  }

  if (ordersByStatus.pending > ordersByStatus.prepared * 2) {
    insights += `- The kitchen might need more staff as there are many pending orders\n`;
  }

  if (averageOrderValue < 15) {
    insights += `- Try offering combo deals to increase average order value\n`;
  } else {
    insights += `- Your average order value is good, consider loyalty rewards for repeat customers\n`;
  }

  if (ordersByPayment.pending > ordersByPayment.completed * 0.5) {
    insights += `- Review your payment process, many customers are abandoning payment\n`;
  }

  return insights;
}

// Fallback function to generate basic stats if even local insights generation fails
function generateBasicStats(orders) {
  const totalRevenue = orders
    .reduce((sum, order) => sum + parseFloat(order.amount), 0)
    .toFixed(2);
  const completedPayments = orders.filter(
    (o) => o.payment_status === "completed"
  ).length;
  return `Total Orders: ${orders.length}\nTotal Revenue: $${totalRevenue}\nCompleted Payments: ${completedPayments}`;
}

app.get('/check-auth', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.sendStatus(200); // ✅ still logged in
  } else {
    res.sendStatus(401); // ❌ session expired or logged out
  }
});


// Orders UI
app.get('/orders', isAuthenticated, (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); // ⛔ don't cache
  res.sendFile(path.join(__dirname, 'orders.html'));
});




app.get("/insights", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "insights.html"));
});


// Mark as Prepared
app.post("/mark-prepared/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query(
      `SELECT phone, item, token FROM orders WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    await pool.query(`UPDATE orders SET status = 'prepared' WHERE id = $1`, [
      id,
    ]);

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
    const result = await pool.query(
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

app.get("/menu", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM menu_items ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch menu items");
  }
});
