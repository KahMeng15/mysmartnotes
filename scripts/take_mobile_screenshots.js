const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHYiOjAsImV4cCI6MTc4MDA4MDE3MywidHlwZSI6ImFjY2VzcyJ9.SH1oq3LE8Fy434yeYSBwAAiYKUpf6t253K4hVfjY-vE";
const NOTE_ID = "nt_de56c026";
const QUIZ_ID = "qz_300f5601";
const SUBJECT_ID = "sj_f6e28a5d";
const GROUP_ID = "gp_49c4718e";
const BASE_URL = "http://127.0.0.1:8000";
const OUTPUT_DIR = "/Users/kahmeng/.gemini/antigravity-ide/brain/9148123b-f0cf-42e0-9589-a3726c671637/browser_recordings";

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Set viewport to mobile (iPhone X)
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // 1. Visit login to establish domain context and clear existing storage
  console.log("Setting domain context...");
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate(() => {
    localStorage.clear();
  });

  // 2. Capture clean login screen
  console.log("Capturing login page...");
  await page.screenshot({ path: path.join(OUTPUT_DIR, "01_login.png"), fullPage: true });

  // 3. Set auth cookies & localStorage
  console.log("Setting access_token cookie & localStorage...");
  await page.setCookie({
    name: 'access_token',
    value: TOKEN,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    secure: false
  });

  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: 2,
      username: "testuser",
      email: "test@example.com",
      full_name: "Alex Student",
      nickname: "Alex",
      is_active: true,
      is_admin: true
    }));
  }, TOKEN);

  // Helper to capture a page
  const capture = async (urlPath, filename) => {
    const fullUrl = `${BASE_URL}${urlPath}`;
    console.log(`Capturing ${fullUrl} -> ${filename}...`);
    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle2' });
      // wait a bit for dynamic page load / transitions
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));
      await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: true });
    } catch (e) {
      console.error(`Failed to capture ${urlPath}:`, e.message);
    }
  };

  try {
    // Capture all core pages
    await capture("/dashboard", "02_dashboard.png");
    await capture("/mynotes", "03_mynotes.png");
    await capture(`/note/${NOTE_ID}`, "04_note_details.png");
    await capture(`/quiz/${QUIZ_ID}`, "05_quiz_view.png");
    await capture("/settings", "06_settings.png");
    await capture("/analytics", "07_analytics.png");
    await capture("/admin", "08_admin.png");
    await capture("/chat", "09_chat.png");
    await capture("/upload", "10_upload.png");
    await capture("/exporttemplates", "11_exporttemplates.png");
    await capture("/pomodoro", "12_pomodoro.png");
    await capture(`/subject/${SUBJECT_ID}`, "13_subject_details.png");
    await capture(`/group/${GROUP_ID}`, "14_group_details.png");

  } catch (err) {
    console.error("Error capturing pages:", err);
  } finally {
    await browser.close();
    console.log("Browser closed. Screenshots taken.");
  }
}

run();

