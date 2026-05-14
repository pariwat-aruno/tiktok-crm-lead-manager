# GitHub Pages Frontend

ใช้เมื่อ LIFF เปิดบน Apps Script แล้ว `liff.init()` timeout เพราะ Apps Script redirect ไป `script.googleusercontent.com`

## ไฟล์ที่ใช้

โฟลเดอร์ `frontend/` คือ static frontend สำหรับ GitHub Pages

- `index.html` หน้าเริ่มต้น
- `app.html` auto-route ตาม role
- `register.html` ลงทะเบียน new user
- `owner.html`, `manager.html`, `lead.html`, `staff.html`, `leave.html`, `myid.html`
- `.nojekyll` ให้ GitHub Pages serve ไฟล์ตรงๆ

สร้างใหม่จาก Apps Script HTML ได้ด้วย:

```bash
node tools/build-frontend.js
```

## ตั้ง GitHub Pages

1. สร้าง GitHub repo ใหม่ เช่น `tiktok-crm-lead-manager`
2. push โปรเจกต์นี้ขึ้น GitHub
3. GitHub repo → Settings → Pages
4. Source: Deploy from a branch
5. Branch: `main`
6. Folder: `/frontend`
7. Save

หลังเปิด Pages แล้ว URL จะประมาณ:

```text
https://<github-user>.github.io/tiktok-crm-lead-manager/
```

## ตั้ง LINE LIFF

ตั้ง LIFF Endpoint URL เป็น GitHub Pages root URL:

```text
https://<github-user>.github.io/tiktok-crm-lead-manager/
```

อย่าตั้งเป็น `app.html` เพราะลิงก์ `liff.line.me/<LIFF_ID>/owner` จะถูกส่งกลับมาที่ root ผ่าน `liff.state` แล้ว frontend router จะพาไปหน้าเป้าหมายเอง

## Backend

Frontend เรียก Apps Script backend ตัวเดิม:

```text
https://script.google.com/macros/s/AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ/exec
```

ทดสอบ backend:

```bash
curl -L -H 'Content-Type: text/plain;charset=utf-8' \
  --data '{"action":"ping"}' \
  'https://script.google.com/macros/s/AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ/exec'
```
