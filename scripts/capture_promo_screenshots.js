const { chromium } = require('playwright-chromium');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 2, // Retina 2x crisp output
    locale: 'zh-CN'
  });

  const page = await context.newPage();

  // 1. Visit local site
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });

  // 2. Setup realistic mock listening plan with primary & backup sessions
  await page.evaluate(() => {
    // Add realistic curated listening schedule:
    // Session 1 (09:00 - 10:30), 12, 19 (overlap for conflict preview), 28, 41, 56, 68
    const mockPlan = {
      "1": { seq: 1, role: "primary", note: "开幕必听！李诞 & 呼兰对话", addedAt: Date.now() - 3600000 },
      "12": { seq: 12, role: "primary", note: "圆桌讨论：播客的商业化突围", addedAt: Date.now() - 3000000 },
      "13": { seq: 13, role: "backup", note: "同时间备选：如果12号厅满人转战这里", addedAt: Date.now() - 2500000 },
      "25": { seq: 25, role: "primary", note: "午间科技专场：AI赋能声音创作", addedAt: Date.now() - 2000000 },
      "41": { seq: 41, role: "primary", note: "文化文艺重头戏", addedAt: Date.now() - 1500000 },
      "58": { seq: 58, role: "primary", note: "两性情感深夜治愈专场", addedAt: Date.now() - 1000000 },
      "72": { seq: 72, role: "backup", note: "备选场次", addedAt: Date.now() - 500000 }
    };
    localStorage.setItem('kuanival_user_plan_2026', JSON.stringify(mockPlan));
    
    // Set user nickname
    localStorage.setItem('kuanival_user_name', '狂喜特派员·阿狸');
    
    // Reload plan in app state
    if (typeof loadStateFromStorage === 'function') {
      loadStateFromStorage();
    }
    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });

  await page.waitForTimeout(600);

  // Ensure assets dir exists
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // ===== CAPTURE 1: 全景时刻表与9大话题多维排期矩阵视图 =====
  console.log('Capturing Screenshot 1: Schedule View...');
  // Scroll down slightly so the topic filter bar and timeline groups are perfectly showcased
  await page.evaluate(() => {
    window.scrollTo({ top: 380, behavior: 'instant' });
  });
  await page.waitForTimeout(400);

  const shot1Path = path.join(assetsDir, 'screenshot-schedule-view.png');
  await page.screenshot({
    path: shot1Path,
    fullPage: false
  });
  console.log(`Saved: ${shot1Path}`);

  // ===== CAPTURE 2: 全能海报长图工作室 (Export Studio) 实机效果 =====
  console.log('Capturing Screenshot 2: Export Studio Modal...');
  // Scroll back top & Open Export Studio
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (typeof openExportStudio === 'function') {
      openExportStudio();
    }
    const nameInput = document.getElementById('posterUserName');
    if (nameInput) {
      nameInput.value = '狂喜特派员 · 阿狸';
    }
    const titleInput = document.getElementById('posterTitleInput');
    if (titleInput) {
      titleInput.value = '在CMG融媒影城，打捞一整天的声音奇遇 🎙️';
    }
    if (typeof renderSchedulePosterCanvas === 'function') {
      renderSchedulePosterCanvas();
    }
  });

  // Wait for canvas poster rendering
  await page.waitForTimeout(1200);

  const shot2Path = path.join(assetsDir, 'screenshot-export-studio.png');
  await page.screenshot({
    path: shot2Path,
    fullPage: false
  });
  console.log(`Saved: ${shot2Path}`);

  await browser.close();
  console.log('Screenshots generation completed successfully!');
}

main().catch(err => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
