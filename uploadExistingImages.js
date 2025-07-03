require('dotenv').config(); // Load environment variables
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// --- AWS S3 Configuration ---
// Make sure these environment variables are set in your .env file
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION // e.g., 'ap-south-1' for Mumbai
});

const s3 = new AWS.S3();

// Define the directory where your local images are stored
// This assumes the 'images' folder is in the same directory as this script.
const LOCAL_IMAGES_DIR = path.join(__dirname, 'images');

// Define the S3 folder prefix (where images will be stored in S3)
// This should be consistent with the 'key' function in your multerS3 setup ('menu-items/')
const S3_FOLDER_PREFIX = 'menu-items/';

/**
 * Uploads a single file to AWS S3.
 * @param {string} filePath - The full path to the local file.
 * @param {string} s3Key - The desired key (path + filename) for the object in S3.
 * @returns {Promise<string>} A promise that resolves with the S3 URL of the uploaded file, or rejects with an error.
 */
async function uploadFileToS3(filePath, s3Key) {
    const fileContent = fs.readFileSync(filePath);
    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ACL: 'public-read' // Makes the uploaded files publicly readable
    };

    return new Promise((resolve, reject) => {
        s3.upload(params, (err, data) => {
            if (err) {
                console.error(`Error uploading ${s3Key}:`, err);
                reject(err);
            } else {
                console.log(`Successfully uploaded ${s3Key} to ${data.Location}`);
                resolve(data.Location); // Returns the S3 URL
            }
        });
    });
}

/**
 * Iterates through all files in a specified local directory and uploads them to S3.
 * Prints a summary of uploaded files and instructions for database updates.
 */
async function uploadAllExistingImages() {
    console.log(`Starting upload of images from: ${LOCAL_IMAGES_DIR}`);

    // Check if the local images directory exists
    if (!fs.existsSync(LOCAL_IMAGES_DIR)) {
        console.error(`Error: Directory not found at ${LOCAL_IMAGES_DIR}.`);
        console.error("Please ensure the 'images' folder exists in the same directory as this script and contains your images.");
        return;
    }

    const files = fs.readdirSync(LOCAL_IMAGES_DIR);

    if (files.length === 0) {
        console.log(`No files found in ${LOCAL_IMAGES_DIR}. No images to upload.`);
        return;
    }

    const uploadedImageUrls = [];

    // Process each file in the directory
    for (const file of files) {
        const filePath = path.join(LOCAL_IMAGES_DIR, file);

        // Check if it's actually a file (and not a subdirectory)
        if (fs.statSync(filePath).isFile()) {
            const fileExtension = path.extname(file);
            const fileNameWithoutExt = path.basename(file, fileExtension);
            // Construct a unique S3 key using a timestamp to avoid overwrites and maintain consistency
            // with how new images are uploaded via multer-s3.
            const s3Key = `${S3_FOLDER_PREFIX}${Date.now()}-${fileNameWithoutExt}${fileExtension}`;

            try {
                const imageUrl = await uploadFileToS3(filePath, s3Key);
                uploadedImageUrls.push({ fileName: file, s3Url: imageUrl });
            } catch (error) {
                console.error(`Failed to upload "${file}". Skipping to the next file.`);
            }
        } else {
            console.log(`Skipping directory: ${file}`);
        }
    }

    console.log("\n--- Upload Process Complete ---");
    if (uploadedImageUrls.length > 0) {
        console.log("Successfully uploaded the following images and their S3 URLs:");
        uploadedImageUrls.forEach(item => console.log(`- ${item.fileName}: ${item.s3Url}`));

        console.log("\n--- IMPORTANT NEXT STEP ---");
        console.log("You now need to manually update your PostgreSQL database (the 'menu_items' table) with these new S3 URLs.");
        console.log("For each item, replace the old 'image' path with the new S3 URL. For example:");
        console.log("\nExample SQL UPDATE Statement:");
        console.log("  UPDATE menu_items");
        console.log("  SET image = 'YOUR_S3_URL_FOR_BURGER_HERE'");
        console.log("  WHERE name = 'Classic Burger'; -- Or WHERE id = YOUR_ITEM_ID;");
        console.log("\nRepeat this for each image you uploaded, matching the S3 URL to the correct menu item.");
    } else {
        console.log("No images were successfully uploaded. Please check the 'images' directory and your AWS credentials/permissions.");
    }
}

// Execute the main upload function when the script is run
uploadAllExistingImages();