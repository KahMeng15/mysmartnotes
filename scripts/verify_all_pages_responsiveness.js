const puppeteer = require('puppeteer');

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHYiOjAsImV4cCI6MTc4MDA4MDE3MywidHlwZSI6ImFjY2VzcyJ9.SH1oq3LE8Fy434yeYSBwAAiYKUpf6t253K4hVfjY-vE";
const BASE_URL = "http://127.0.0.1:8000";

async function checkPage(page, urlPath, name, viewportWidth) {
  const fullUrl = `${BASE_URL}${urlPath}`;
  await page.goto(fullUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

  const result = await page.evaluate((width) => {
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const winWidth = window.innerWidth;
    
    const hasHorizontalScroll = docWidth > winWidth + 1 || bodyWidth > winWidth + 1;
    const overflowingElements = [];
    
    if (hasHorizontalScroll) {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > winWidth + 1) {
          let selector = el.tagName.toLowerCase();
          if (el.id) selector += `#${el.id}`;
          if (el.className) selector += `.${el.className.split(' ').join('.')}`;
          overflowingElements.push({
            selector: selector.substring(0, 80),
            width: rect.width,
            right: rect.right
          });
        }
      }
    }
    
    return {
      title: document.title,
      docWidth,
      winWidth,
      hasHorizontalScroll,
      overflowCount: overflowingElements.length,
      overflowingElements: overflowingElements.slice(0, 3)
    };
  }, viewportWidth);

  return result;
}

async function run() {
  console.log("Launching headless browser for full page audit...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Login
  await page.goto(`${BASE_URL}/login`);
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

  // 1. Fetch dynamic IDs from API
  console.log("Fetching subjects, groups, notes, and quizzes to audit dynamic paths...");
  let subjectId = null;
  let groupId = null;
  let lectureId = null;
  let quizId = null;

  try {
    // Fetch subjects
    const subjectsResponse = await page.goto(`${BASE_URL}/subjects`);
    const subjects = await subjectsResponse.json();
    if (subjects && subjects.length > 0) {
      subjectId = subjects[0].id;
    }

    // Fetch groups
    const groupsResponse = await page.goto(`${BASE_URL}/groups`);
    const groups = await groupsResponse.json();
    if (groups && groups.length > 0) {
      groupId = groups[0].id;
    }

    // Fetch lectures
    const lecturesResponse = await page.goto(`${BASE_URL}/lectures`);
    const lectures = await lecturesResponse.json();
    if (lectures && lectures.length > 0) {
      lectureId = lectures[0].id;
    }

    // Fetch quizzes
    // We can list quizzes or just guess based on seed
    quizId = "qz_300f5601"; // seeded
  } catch (e) {
    console.error("Could not fetch database IDs from API:", e.message);
  }

  const pagesToAudit = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "My Notes List", path: "/mynotes" },
    { name: "Chat Dashboard", path: "/chat" },
    { name: "Quiz Dashboard", path: "/quiz" },
    { name: "Settings Panel", path: "/settings" },
    { name: "File Upload Panel", path: "/upload" },
    { name: "Export Templates Selector", path: "/exporttemplates" },
    { name: "Pomodoro Focus Timer", path: "/pomodoro" },
    { name: "Admin Dashboard", path: "/admin" },
    { name: "Usage Analytics", path: "/analytics" }
  ];

  if (subjectId) pagesToAudit.push({ name: "Subject Details Page", path: `/subject/${subjectId}` });
  if (groupId) pagesToAudit.push({ name: "Group Folder Page", path: `/group/${groupId}` });
  if (lectureId) pagesToAudit.push({ name: "Note Content Details", path: `/note/${lectureId}` });
  if (quizId) pagesToAudit.push({ name: "Quiz View / Play Page", path: `/quiz/${quizId}` });

  const viewports = [
    { width: 375, height: 812, name: "Mobile (375px)" },
    { width: 768, height: 1024, name: "Tablet (768px)" }
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\nAuditing at viewport: ${vp.name}`);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    
    for (const pg of pagesToAudit) {
      try {
        const audit = await checkPage(page, pg.path, pg.name, vp.width);
        results.push({
          viewport: vp.name,
          page: pg.name,
          path: pg.path,
          hasScroll: audit.hasHorizontalScroll,
          docWidth: audit.docWidth,
          winWidth: audit.winWidth,
          overflowCount: audit.overflowCount,
          overflowingElements: audit.overflowingElements
        });
        console.log(`- ${pg.name}: ${audit.hasHorizontalScroll ? "⚠️ OVERFLOW" : "✅ OK"}`);
      } catch (err) {
        console.error(`Error auditing ${pg.name}:`, err.message);
      }
    }
  }

  console.log("\n========================================");
  console.log("Audit Complete! Final Report Summary:");
  console.log("========================================");
  
  const overflows = results.filter(r => r.hasScroll);
  if (overflows.length === 0) {
    console.log("✅ All pages are fully responsive! No horizontal overflows detected.");
  } else {
    console.log(`⚠️ Detected ${overflows.length} layout overflow issues:`);
    overflows.forEach(o => {
      console.log(`- [${o.viewport}] ${o.page} (${o.path}) has width ${o.docWidth}px (win is ${o.winWidth}px)`);
      console.log(`  Top overflowing elements:`, o.overflowingElements);
    });
  }

  await browser.close();
}

run();
