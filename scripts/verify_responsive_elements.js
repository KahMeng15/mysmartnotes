const puppeteer = require('puppeteer');

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwidHYiOjAsImV4cCI6MTc4MDA4MDE3MywidHlwZSI6ImFjY2VzcyJ9.SH1oq3LE8Fy434yeYSBwAAiYKUpf6t253K4hVfjY-vE";
const NOTE_ID = "nt_de56c026";
const QUIZ_ID = "qz_300f5601";
const BASE_URL = "http://127.0.0.1:8000";

async function checkPage(page, urlPath, name) {
  const fullUrl = `${BASE_URL}${urlPath}`;
  console.log(`\n========================================`);
  console.log(`Checking ${name} (${fullUrl})`);
  console.log(`========================================`);
  
  await page.goto(fullUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

  const analysis = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const bodyWidth = document.body.scrollWidth;
    
    // Check if the page has horizontal scrollbar
    const hasHorizontalScroll = docWidth > winWidth || bodyWidth > winWidth;
    
    // Find elements causing horizontal overflow
    const overflowingElements = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > winWidth + 1) {
        // Find selector/tag/id
        let selector = el.tagName.toLowerCase();
        if (el.id) selector += `#${el.id}`;
        if (el.className) selector += `.${el.className.split(' ').join('.')}`;
        overflowingElements.push({
          selector: selector.substring(0, 80),
          width: rect.width,
          right: rect.right,
          parent: el.parentElement ? el.parentElement.tagName.toLowerCase() : 'none'
        });
      }
    }

    // Check display states of core responsive layout components
    const mobileHeader = document.querySelector('.mobile-header');
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    const appSidebar = document.querySelector('.app-sidebar');
    const pageCard = document.querySelector('.page-card');
    const noteContentCard = document.querySelector('.note-content-card');

    const getVisibility = (el) => {
      if (!el) return 'NOT_FOUND';
      const style = window.getComputedStyle(el);
      return (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') ? 'VISIBLE' : 'HIDDEN';
    };

    return {
      title: document.title,
      winWidth,
      docWidth,
      bodyWidth,
      hasHorizontalScroll,
      overflowCount: overflowingElements.length,
      overflowingElements: overflowingElements.slice(0, 5), // return top 5
      components: {
        mobileHeader: getVisibility(mobileHeader),
        mobileBottomNav: getVisibility(bottomNav),
        appSidebar: getVisibility(appSidebar),
        appSidebarWidth: appSidebar ? appSidebar.getBoundingClientRect().width : 0,
        pageCard: getVisibility(pageCard),
        pageCardWidth: pageCard ? pageCard.getBoundingClientRect().width : 0,
        noteContentCard: getVisibility(noteContentCard),
        noteContentCardWidth: noteContentCard ? noteContentCard.getBoundingClientRect().width : 0
      }
    };
  });

  console.log(`Page Title: "${analysis.title}"`);
  console.log(`Horizontal Scroll: ${analysis.hasHorizontalScroll ? "⚠️ YES" : "✅ NO"} (Doc: ${analysis.docWidth}px, Win: ${analysis.winWidth}px)`);
  
  if (analysis.hasHorizontalScroll) {
    console.log(`Overflowing elements detected:`, analysis.overflowingElements);
  }
  
  console.log(`Component visibility states:`);
  console.log(`- Mobile Header:    ${analysis.components.mobileHeader}`);
  console.log(`- Mobile BottomNav: ${analysis.components.mobileBottomNav}`);
  console.log(`- App Sidebar:      ${analysis.components.appSidebar} (width: ${analysis.components.appSidebarWidth}px)`);
  console.log(`- Page Card:        ${analysis.components.pageCard} (width: ${analysis.components.pageCardWidth}px)`);
  if (analysis.components.noteContentCard !== 'NOT_FOUND') {
    console.log(`- Note ContentCard: ${analysis.components.noteContentCard} (width: ${analysis.components.noteContentCardWidth}px)`);
  }
}

async function run() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

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

  try {
    await checkPage(page, "/dashboard", "Dashboard");
    await checkPage(page, "/mynotes", "My Notes");
    await checkPage(page, `/note/${NOTE_ID}`, "Note Details");
    await checkPage(page, `/quiz/${QUIZ_ID}`, "Quiz View");
    await checkPage(page, "/settings", "Settings");
  } catch (e) {
    console.error("Error checking elements:", e);
  } finally {
    await browser.close();
  }
}

run();
