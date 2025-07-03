require('dotenv').config();
const { Pool } = require('pg');
const path = require('path'); // Required for path.basename and path.extname

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Render requires SSL
});

// IMPORTANT: This array is populated directly from your S3 upload log.
// Each 'originalName' MUST be exactly as it was when uploaded to S3 (including spaces).
// Each 's3Url' is the full URL from the upload log.
const s3Uploads = [
    { originalName: "Campa Cola.webp", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489646566-Campa%20Cola.webp" },
    { originalName: "Campa.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489646701-Campa.jpg" },
    { originalName: "chicken 65 Roll.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489647004-chicken%2065%20Roll.jpg" },
    { originalName: "Chicken Biriyani.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489647246-Chicken%20Biriyani.jpg" },
    { originalName: "Chicken Fried Rice.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489647593-Chicken%20Fried%20Rice.jpg" },
    { originalName: "Chicken Noodles.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489647856-Chicken%20Noodles.jpg" },
    { originalName: "Chicken Patty Burger.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489648055-Chicken%20Patty%20Burger.jpg" },
    { originalName: "Chicken puff.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489648447-Chicken%20puff.jpg" }, // Not in your provided DB sample, but included if you have it
    { originalName: "Chicken Sandwich.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489648631-Chicken%20Sandwich.jpg" }, // Not in your provided DB sample, but included if you have it
    { originalName: "Chicken Schezwan Fried Rice.png", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489648849-Chicken%20Schezwan%20Fried%20Rice.png" },
    { originalName: "Chicken Schezwan Noodles.png", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489649262-Chicken%20Schezwan%20Noodles.png" },
    { originalName: "Chicken Shawarma.webp", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489649442-Chicken%20Shawarma.webp" },
    { originalName: "Choco Lava Cake.webp", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489649702-Choco%20Lava%20Cake.webp" },
    { originalName: "Chocolate Donut.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489649973-Chocolate%20Donut.jpg" },
    { originalName: "Maaza.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489650761-Maaza.jpg" },
    { originalName: "no image.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489650938-no%20image.jpg" }, // Only if you want to link a menu item to the S3 'no image'. Otherwise, remove.
    { originalName: "Veg Burger.webp", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489651304-Veg%20Burger.webp" },
    { originalName: "Water Bottle.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489651490-Water%20Bottle.jpg" },
    { originalName: "White Sauce Pasta.jpg", s3Url: "https://swiftbytes-images.s3.ap-south-1.amazonaws.com/menu-items/1751489651666-White%20Sauce%20Pasta.jpg" },
];

async function updateDatabaseWithS3Urls() {
    let client;
    try {
        client = await db.connect(); // Get a client from the pool

        for (const item of s3Uploads) {
            // Extract base name without extension for matching
            const baseName = path.basename(item.originalName, path.extname(item.originalName));
            let dbMatchName = baseName.trim(); // Default to the cleaned filename

            // --- SPECIAL MAPPING FOR DB NAME DIFFERENCES ---
            if (baseName === "Water Bottle") {
                dbMatchName = "Bisleri Water Bottle"; // Match DB's exact name
            } else if (baseName.toLowerCase() === "choco lava cake") {
                dbMatchName = "choco lava cake"; // Match DB's exact lowercase name
            } else if (baseName === "Chicken Biriyani") {
                dbMatchName = "Chicken Biryani"; // Match DB's spelling 'y'
            }
            // Add other specific mappings here if more inconsistencies arise.
            // For general matching, ILIKE usually works for case differences.
            // --------------------------------------------------

            console.log(`Attempting to update menu item for '${dbMatchName}' with S3 URL: ${item.s3Url}`);

            const result = await client.query(
                `UPDATE menu_items SET image = $1 WHERE name ILIKE $2`, // ILIKE for case-insensitive and slight variation matching
                [item.s3Url, dbMatchName]
            );

            if (result.rowCount > 0) {
                console.log(`✅ Successfully updated '${dbMatchName}'`);
            } else {
                console.warn(`⚠️ No menu item found for '${dbMatchName}'. Please check your 'menu_items' table or the mapping logic.`);
            }
        }
        console.log("\n--- Database update process complete ---");

        // Optional: Verify a few updates directly
        // const verification = await client.query(`SELECT name, image FROM menu_items WHERE name IN ('Veg Burger', 'Bisleri Water Bottle', 'Chicken Biryani')`);
        // console.log("\n--- Verification of selected items ---");
        // verification.rows.forEach(row => console.log(row));

    } catch (err) {
        console.error("❌ Error updating database:", err);
    } finally {
        if (client) {
            client.release(); // Release the client back to the pool
        }
        await db.end(); // Close the database pool
    }
}

updateDatabaseWithS3Urls();