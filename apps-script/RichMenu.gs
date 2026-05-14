/**
 * RichMenu.gs — สร้าง rich menu ของ LINE OA แบบ programmatic
 *
 * ขั้นตอนใช้ครั้งแรก:
 *   1. เตรียม image 2500x843 px (PNG/JPG ≤1 MB) ออกแบบใน Canva/Figma
 *      - แบ่งเป็น 3 ช่องเท่าๆ กัน (กว้างช่องละ ~833 px)
 *      - เขียนข้อความใน image: [เปิดระบบ] [ขอลา] [My ID]
 *   2. Upload ไฟล์ขึ้น Drive
 *      - คลิกขวา → Share → "Anyone with the link" → Viewer
 *      - copy "file ID" จาก URL: drive.google.com/file/d/<FILE_ID>/view
 *   3. รัน setupRichMenu จาก Apps Script Editor:
 *        a. สร้าง wrapper function ใน Setup.gs:
 *             function _setupMenu() { setupRichMenu('PASTE_FILE_ID_HERE'); }
 *        b. Save → Run _setupMenu → ดู log
 *        c. ลบ wrapper function ทิ้ง (เพื่อความสะอาด)
 *
 * แก้ปุ่ม (action ของแต่ละช่อง):
 *   - แก้ใน _richMenuObject_() ด้านล่าง
 *   - รัน setupRichMenu ใหม่ — จะลบของเดิม + สร้างใหม่ + set default
 *
 * Tile layout (กว้าง 2500 x สูง 843):
 *   ┌──────────────┬──────────────┬──────────────┐
 *   │  เปิดระบบ    │    ขอลา       │   My ID      │
 *   │  /app        │   /leave      │   /id        │
 *   └──────────────┴──────────────┴──────────────┘
 */

function _richMenuObject_() {
  const liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
  if (!liffId) throw new Error('LIFF_ID ยังไม่ตั้ง — รัน setLiffId() ก่อน');
  const liffBase = 'https://liff.line.me/' + liffId;
  return {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'TikTok CRM Menu',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: 'uri', label: 'เปิดระบบ', uri: liffBase + '/app' },
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: 'uri', label: 'ขอลา', uri: liffBase + '/leave' },
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'uri', label: 'My ID', uri: liffBase + '/id' },
      },
    ],
  };
}

/**
 * Main — สร้าง rich menu + upload image + set เป็น default ให้ทุกคน
 * @param {string} imageFileIdOrUrl  Drive file ID หรือ URL ของรูป (2500x843)
 */
function setupRichMenu(imageFileIdOrUrl) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ตั้ง');
  if (!imageFileIdOrUrl) throw new Error('ต้องระบุ Drive file ID หรือ URL ของรูป');

  Logger.log('━━━ Rich Menu Setup ━━━');

  // 1. โหลดรูป + ตรวจ size + content type
  const blob = _loadImage_(imageFileIdOrUrl);
  const ct = blob.getContentType();
  if (ct.indexOf('image/') !== 0) {
    throw new Error('ไฟล์ไม่ใช่รูป (content-type=' + ct + ')');
  }
  Logger.log('✓ โหลดรูป: ' + blob.getName() + ' (' + ct + ', ' + blob.getBytes().length + ' bytes)');

  // 2. ลบ rich menu เก่าทั้งหมดของ OA นี้
  _deleteAllRichMenus_(token);

  // 3. สร้าง rich menu object
  const menuObj = _richMenuObject_();
  const create = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(menuObj),
    muteHttpExceptions: true,
  });
  if (create.getResponseCode() !== 200) {
    throw new Error('Create rich menu fail (HTTP ' + create.getResponseCode() + '): ' + create.getContentText());
  }
  const richMenuId = JSON.parse(create.getContentText()).richMenuId;
  Logger.log('✓ สร้าง rich menu: ' + richMenuId);

  // 4. upload image
  const upload = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/richmenu/' + richMenuId + '/content', {
    method: 'post',
    contentType: ct,
    headers: { Authorization: 'Bearer ' + token },
    payload: blob.getBytes(),
    muteHttpExceptions: true,
  });
  if (upload.getResponseCode() !== 200) {
    throw new Error('Upload image fail (HTTP ' + upload.getResponseCode() + '): ' + upload.getContentText());
  }
  Logger.log('✓ Upload image');

  // 5. set เป็น default ให้ทุก user
  const setDefault = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (setDefault.getResponseCode() !== 200) {
    throw new Error('Set default fail (HTTP ' + setDefault.getResponseCode() + '): ' + setDefault.getContentText());
  }
  Logger.log('✓ Set default rich menu');

  // 6. บันทึก rich_menu_id ใน Config
  try { setConfig('rich_menu_id', richMenuId); } catch (e) {}

  Logger.log('━━━━━━━━━━━━━━━━━━━━');
  Logger.log('✅ เสร็จ — richMenuId: ' + richMenuId);
  Logger.log('   ลองเปิด LINE OA → จะเห็น menu ที่ chat bar');

  return richMenuId;
}

/**
 * Quick setup — generate rich menu image ผ่าน placehold.co ทันที (ไม่ต้องเปิด LIFF)
 *   - image เป็นพื้นสี brand + text "MENU" (ไม่แบ่งช่องชัด แต่ทำงานได้ทันที)
 *   - หลังรันแล้ว ถ้าอยาก image สวยขึ้น → เปิด LIFF /menu มา customize
 */
function setupRichMenuQuick() {
  const cfg = getConfig();
  const color = (cfg.brand_color || '#c8102e').replace('#', '');
  const brand = encodeURIComponent(cfg.brand_name || 'CRM');
  // 3-tile labels (รวมใน image, แต่ใช้ font default)
  const url = 'https://placehold.co/2500x843/' + color + '/ffffff/png' +
              '?text=' + brand + '%0A%E0%B9%80%E0%B8%9B%E0%B8%B4%E0%B8%94%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A++++%E0%B8%82%E0%B8%AD%E0%B8%A5%E0%B8%B2++++My+ID' +
              '&font=raleway';

  Logger.log('━━━ Quick Rich Menu Setup ━━━');
  Logger.log('• Fetching image from: ' + url);

  let blob;
  try {
    blob = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getBlob()
      .setName('crm-menu-quick.png');
  } catch (e) {
    throw new Error('Fetch placeholder image fail: ' + e.message);
  }

  // save Drive
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  let file;
  if (folderId) {
    try { file = DriveApp.getFolderById(folderId).createFile(blob); }
    catch (e) { file = DriveApp.createFile(blob); }
  } else {
    file = DriveApp.createFile(blob);
  }
  Logger.log('• Image saved: ' + file.getUrl());

  return setupRichMenu(file.getId());
}

/**
 * Setup rich menu จาก base64 image (ใช้กับ page-genmenu — canvas → PNG → upload)
 *   args: { imageBase64, lineUserId }
 */
function setupRichMenuFromBase64(args) {
  if (!isOwner(args.lineUserId)) return { ok: false, error: 'forbidden' };
  if (!args.imageBase64) return { ok: false, error: 'no_image' };

  try {
    const clean = String(args.imageBase64).replace(/^data:[^,]+,/, '');
    const bytes = Utilities.base64Decode(clean);
    const blob = Utilities.newBlob(bytes, 'image/png',
      'crm-richmenu-' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss') + '.png');

    // save ลง Drive folder ของระบบ (ไว้ ref ภายหลังถ้าจะแก้)
    const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
    let file;
    if (folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        file = folder.createFile(blob);
      } catch (e) { file = DriveApp.createFile(blob); }
    } else {
      file = DriveApp.createFile(blob);
    }

    // เรียก setupRichMenu ด้วย Drive file ID
    const richMenuId = setupRichMenu(file.getId());
    return { ok: true, fileId: file.getId(), richMenuId: richMenuId };
  } catch (e) {
    logError('setupRichMenuFromBase64', e.message);
    return { ok: false, error: 'setup_failed', detail: e.message };
  }
}

/**
 * ลบ rich menu ทั้งหมด + เคลียร์ default (กลับเป็นไม่มี menu)
 */
function removeAllRichMenus() {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ตั้ง');
  UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', {
    method: 'delete',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  _deleteAllRichMenus_(token);
  Logger.log('✓ ลบ rich menu ทั้งหมดแล้ว');
}

/**
 * list rich menu ทั้งหมดของ OA นี้ — debug
 */
function listRichMenus() {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  Logger.log(res.getContentText());
}

/* ===== Internal ===== */

function _loadImage_(idOrUrl) {
  if (/^https?:\/\//.test(idOrUrl)) {
    // public URL — ถ้าเป็น Drive share link จะใช้ uc?id= แทน
    const m = String(idOrUrl).match(/\/d\/([-\w]{25,})/);
    if (m) return DriveApp.getFileById(m[1]).getBlob();
    return UrlFetchApp.fetch(idOrUrl).getBlob();
  }
  // assume Drive file ID
  let id = idOrUrl;
  const m2 = String(idOrUrl).match(/[-\w]{25,}/);
  if (m2) id = m2[0];
  return DriveApp.getFileById(id).getBlob();
}

function _deleteAllRichMenus_(token) {
  const list = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  if (list.getResponseCode() !== 200) return 0;
  const arr = JSON.parse(list.getContentText()).richmenus || [];
  arr.forEach(function (m) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + m.richMenuId, {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    Logger.log('  - ลบ rich menu เก่า: ' + m.richMenuId);
  });
  return arr.length;
}
