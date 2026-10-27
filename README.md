# DINAR – situs + admin untuk Cloudflare Workers

Siap deploy: KV dan R2 dibuat otomatis oleh Wrangler saat deploy (tidak perlu membuat ID manual).

## Struktur (taruh di ROOT repo)
wrangler.jsonc · worker.js · public/index.html

## Deploy lewat GitHub (Workers Builds)
1. Upload ketiga item di atas ke root repo GitHub.
2. Cloudflare → Workers & Pages → Create → Import a repository → pilih repo.
   Deploy command: npx wrangler deploy   |   Root directory: /
   (Nama Worker di dashboard harus "dinar", sama dengan "name" di wrangler.jsonc.)
3. Setelah build sukses, buka Worker → Settings → Variables and Secrets → tambah SECRET:
   ADMIN_PASSWORD  (kata sandi panjang)
   TOKEN_SECRET    (teks acak panjang)
4. Upload file .apk: Storage & databases → R2 → bucket yang dibuat otomatis untuk Worker ini → Upload.
5. Buka https://<worker>.workers.dev/admin → login → pilih APK → isi pengaturan → Simpan.
6. Domain: Worker → Settings → Domains & Routes → Add custom domain.

## Deploy lewat komputer (alternatif)
npm i -g wrangler && wrangler login && wrangler deploy
wrangler secret put ADMIN_PASSWORD ; wrangler secret put TOKEN_SECRET
wrangler r2 object put <nama-bucket>/game.apk --file ./game.apk --remote

## Keamanan
- Rate limit publik: Security → WAF → Rate limiting rules untuk /api/* (mis. 60 req/menit/IP).
- Lindungi /admin dengan Cloudflare Access (gratis hingga 50 pengguna).
- Batas login (5/15 menit) memakai KV dan bersifat perkiraan.
- Hanya bagikan APK yang kamu punya hak distribusinya.

## Kalau deploy gagal soal R2 / KV
- Error "Please enable R2" (kode 10042): aktifkan R2 dulu di dashboard (menu R2 → Get started/Activate; bisa meminta metode pembayaran, paket gratis tetap ada).
- Tidak mau memakai R2? Hapus baris "r2_buckets" di wrangler.jsonc. Admin tetap jalan, dan APK diisi lewat "link APK eksternal" (https).
- Error "Authentication error" saat membuat KV/R2: token build butuh izin Workers KV Storage: Edit dan Workers R2 Storage: Edit
  (Worker → Settings → Build → ubah/buat API token).
- Error nama: "name" di wrangler.jsonc harus sama dengan nama Worker di dashboard.
- Error "entry-point" / file tidak ditemukan: pastikan worker.js, wrangler.jsonc, dan folder public ada langsung di ROOT repo (bukan di dalam folder dinar-cloudflare).
