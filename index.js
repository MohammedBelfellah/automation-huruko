// index.js

require("dotenv").config(); // Load environment variables

const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const cloudinary = require("./cloudinary"); // Cloudinary configuration
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(helmet());
app.use(morgan("combined")); // Logging
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
  })
);

// Route to test the server
app.get("/test", (req, res) => {
  res.status(200).json({ message: "Server is up and running!" });
});

// Root Route
app.get("/", (req, res) => {
  res.status(200).send("Welcome to the Automation Heroku App!");
});

// Helper function to validate filenames
const isValidFilename = (filename) => {
  return /^processed_image_\d+\.jpg$/.test(filename);
};

// Validation schema using Joi
const postSchema = Joi.object({
  imageUrl: Joi.string().uri().required(),
  logoUrl: Joi.string().uri().required(),
  text01: Joi.string().required(),
  focusText: Joi.string().required(),
  text02: Joi.string().required(),
  direction: Joi.string().valid("ltr", "rtl").optional(),
  language: Joi.string().optional(),
  focusTextColor: Joi.string()
    .pattern(/^#([0-9a-fA-F]{3}){1,2}$/)
    .optional(),
});

// Route to generate post
app.post("/generate-post", async (req, res) => {
  // Validate input
  const { error, value } = postSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  // Destructure validated values
  const {
    imageUrl,
    logoUrl,
    text01,
    focusText,
    text02,
    direction,
    language,
    focusTextColor,
  } = value;

  const textDirection = direction || "ltr";
  const textLanguage = language || "en";
  const focusColor = focusTextColor || "#FF4500";

  try {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${textLanguage}" dir="${textDirection}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        /* Your existing CSS styles */
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          position: relative;
        }
        .container {
          position: relative;
          width: 1080px;
          height: 1080px;
          overflow: hidden;
        }
        .image {
          width: 100%;
          height: 100%;
          background-image: url('${imageUrl}');
          background-size: cover;
          background-position: center;
          filter: brightness(0.7);
        }
        .overlay-top, .overlay-bottom {
          position: absolute;
          left: 0;
          right: 0;
          height: 100px;
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent);
        }
        .overlay-bottom {
          bottom: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent);
        }
        .overlay-top {
          top: 0;
        }
        .logo {
          position: absolute;
          top: 20px;
          ${textDirection === "rtl" ? "left: 20px;" : "right: 20px;"}
          width: 100px;
          height: 100px;
          background-image: url('${logoUrl}');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }
        .text-overlay {
          position: absolute;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          width: 90%;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: center;
          direction: ${textDirection};
        }
        .text {
          color: white;
          font-size: 64px;
          font-weight: bold;
          text-shadow: 2px 2px 10px rgba(0, 0, 0, 0.7);
          margin: 0 10px;
          line-height: 1.2;
        }
        .focus-text {
          background-color: ${focusColor};
          color: white;
          font-size: 64px;
          font-weight: bold;
          padding: 15px 25px;
          border-radius: 10px;
          display: inline-block;
          margin: 0 20px;
          box-shadow: 0 6px 8px rgba(0, 0, 0, 0.2);
          text-shadow: 3px 3px 15px rgba(0, 0, 0, 0.8);
        }
        .bottom-right-lines {
          position: absolute;
          bottom: 20px;
          right: -45px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .line {
          width: 350px;
          height: 8px;
          background-color: ${focusColor};
          margin: 10px 0;
          transform: rotate(-220deg);
        }
        .line-2 {
          width: 350px;
          height: 8px;
          background-color: #ffffff;
          margin: 10px 0;
          transform: rotate(-220deg);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="image"></div>
        <div class="overlay-top"></div>
        <div class="overlay-bottom"></div>
        <div class="logo"></div>
        <div class="text-overlay">
          <div class="text">${text01}</div>
          <div class="focus-text">${focusText}</div>
          <div class="text">${text02}</div>
        </div>
        <div class="bottom-right-lines">
          <div class="line"></div>
          <div class="line-2"></div>
        </div>
      </div>
    </body>
    </html>
    `;

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
      ],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    await page.setViewport({ width: 1080, height: 1080 });

    const fileName = `processed_image_${Date.now()}.jpg`;
    const filePath = path.join("/tmp", fileName); // Using /tmp for temporary storage

    await page.screenshot({
      path: filePath,
      type: "jpeg",
      quality: 100,
      clip: { x: 0, y: 0, width: 1080, height: 1080 },
    });
    await browser.close();

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader
      .upload(filePath, {
        folder: "processed_images", // Optional: specify a folder in Cloudinary
        public_id: fileName.replace(".jpg", ""), // Remove file extension for public_id
        overwrite: true,
        resource_type: "image",
      })
      .catch((error) => {
        console.error("Cloudinary Upload Error:", error);
        return null;
      });

    // Delete the temporary file
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting temporary file:", err);
    });

    if (!uploadResult) {
      return res.status(500).json({ error: "Failed to upload the image." });
    }

    res.json({
      imageUrl: uploadResult.secure_url,
      fileName: uploadResult.public_id,
    });
  } catch (error) {
    console.error("Error processing image:", error.message);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

// Route to delete image
app.delete("/delete-image", async (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res.status(400).json({ error: "fileName is required." });
  }

  if (!isValidFilename(fileName)) {
    return res.status(400).json({ error: "Invalid file name." });
  }

  try {
    // Construct the public ID (assuming all images are in 'processed_images' folder)
    const publicId = `processed_images/${fileName.replace(".jpg", "")}`;

    // Delete the image from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });

    if (result.result !== "ok" && result.result !== "not found") {
      // If the result is not 'ok' or 'not found', treat it as an error
      return res.status(500).json({ error: "Failed to delete the image." });
    }

    res.json({ message: "File deleted successfully." });
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
    res.status(500).json({ error: "Failed to delete the image." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
