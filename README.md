# FareIDE (Desktop)

FareIDE sekarang adalah **aplikasi desktop asli** (Tauri), bukan web app. Tombol
Run tidak lagi mensimulasikan Python di browser (Pyodide) — sekarang benar-benar
memanggil compiler/interpreter yang sudah terpasang di komputermu, persis
seperti cara kerja terminal atau VS Code.

Bahasa yang bisa langsung di-**Run** saat ini: **Python, JavaScript,
TypeScript, C, C++, Java, Rust, Go, PHP, Ruby, Bash, SQL (sqlite3), Perl, Lua,
R.** File HTML punya tombol "Open in Browser" (bukan "Run", karena HTML bukan
dieksekusi tapi ditampilkan). Bahasa lain (CSS/JSON/YAML/XML/Markdown/dll)
tetap dapat syntax highlighting seperti biasa, hanya belum bisa dijalankan.

## 1. Prasyarat

### Wajib (untuk build aplikasinya sendiri)

| Tool | Kebutuhan | Cek dengan |
|---|---|---|
| Node.js | 18+ | `node --version` |
| Rust | **1.77.2 atau lebih baru**, install lewat [rustup.rs](https://rustup.rs) — jangan pakai `apt install rustc`, biasanya kekunoan | `rustc --version` |
| Tauri CLI | otomatis lewat `npm install` (ada di devDependencies) | `npx tauri --version` |

### Dependensi sistem per OS (untuk build/run Tauri-nya)

- **Linux**: `webkit2gtk-4.1`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, `build-essential`, `curl`, `wget`, `file`. Lihat [daftar lengkap di sini](https://v2.tauri.app/start/prerequisites/#linux).
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2 (biasanya sudah bawaan Windows 10/11).

### Opsional (per bahasa yang mau kamu jalankan)

Aplikasinya sendiri **tidak membundel compiler apa pun** — ukurannya bakal
raksasa kalau semua compiler ikut dibundel. Install saja yang kamu butuhkan:

| Bahasa | Yang perlu terpasang |
|---|---|
| Python | `python3` |
| JavaScript | `node` |
| TypeScript | `node` (pakai `npx tsx`, auto-download saat pertama run) |
| C | `gcc` |
| C++ | `g++` |
| Java | JDK (`javac` + `java`) |
| Rust | `rustc` (otomatis ada kalau kamu sudah install Rust di atas) |
| Go | `go` |
| PHP | `php` |
| Ruby | `ruby` |
| Bash | `bash` (bawaan Linux/macOS; di Windows perlu Git Bash/WSL di PATH) |
| SQL | `sqlite3` CLI |
| Perl | `perl` |
| Lua | `lua` |
| R | `Rscript` |

Kalau sebuah toolchain belum terpasang, tombol Run tetap jalan tapi terminal
akan menampilkan pesan error yang jelas (bukan macet diam-diam).

## 2. Setup & jalankan

```bash
npm install
npm run tauri:dev
```

Perintah kedua akan compile backend Rust-nya (lumayan lama di run pertama,
tergantung kecepatan komputer, karena mengunduh & mengcompile semua dependency
Tauri) lalu membuka aplikasinya sebagai window native.

## 3. Build installer

```bash
npm run tauri:build
```

Hasilnya ada di `src-tauri/target/release/bundle/` — `.deb`/`.AppImage`/`.rpm`
di Linux, `.dmg`/`.app` di macOS, `.msi`/`.exe` (NSIS) di Windows. **Build
cross-platform tidak bisa** — kamu harus build di masing-masing OS target
(build di Linux → hasilnya untuk Linux saja, dst).

## 4. Cara kerja eksekusi kode (kalau penasaran)

Saat kamu klik Run:

1. Seluruh file di workspace-mu (bukan cuma file aktif) ditulis ke folder
   temp di disk, supaya proyek multi-file (import lokal, header, class lain)
   ikut kebawa.
2. Backend Rust membangun perintah shell yang sesuai bahasanya (mis. `gcc
   main.c -o main.out && ./main.out`) dan menjalankannya.
3. stdout/stderr di-stream real-time ke panel terminal di UI.
4. Kotak input di terminal mengirim langsung ke stdin proses yang jalan —
   berguna untuk `input()`, `Scanner`, `scanf`, dll.
5. Tombol Stop membunuh seluruh process tree (bukan cuma shell wrapper-nya),
   supaya proses yang di-fork (mis. `go run` yang compile lalu jalankan
   binary terpisah) ikut mati.
6. Hanya satu program yang bisa jalan dalam satu waktu (sesuai desain
   tombol Run/Stop di UI).

## Keterbatasan yang perlu kamu tahu

- **Java**: file dengan `package` declaration belum didukung — asumsinya
  semua file flat/single-package. Nama class harus sama dengan nama file
  (aturan Java standar).
- **TypeScript**: run pertama kali agak lambat karena `npx tsx` mengunduh
  paket tsx dulu; setelah itu cepat (sudah ke-cache).
- Belum ada dukungan untuk project dengan dependency manager sendiri
  (mis. `package.json` dengan `node_modules`, `Cargo.toml` multi-file,
  Maven/Gradle). Cocoknya untuk script/latihan single- atau few-file,
  bukan proyek besar dengan banyak dependency eksternal.
