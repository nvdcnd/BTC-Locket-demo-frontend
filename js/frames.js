// =====================================================
// XUẤT HÌNH THEO KHUNG (frontend/frames/odd|even/*.html)
// Menu chọn dạng xuất → ghép 1 ảnh nhân bản vào mọi ô → tải PNG về máy
// Cơ chế: fetch file khung HTML → đọc các .fs có vị trí % inline → vẽ canvas
// =====================================================

import { loadImage } from './api.js';

const EXPORT_SIZE = 1080; // Ảnh xuất vuông 1080×1080

// Danh sách khung (group khớp thư mục odd/even)
const FRAMES = [
    { id: '1img', name: 'Khung 1 ảnh', group: 'odd', cols: 1, rows: 1, url: 'frames/odd/1img.html' },
    { id: '2img', name: 'Khung 2 ảnh', group: 'even', cols: 1, rows: 2, url: 'frames/even/2img.html' },
    { id: '3img', name: 'Khung 3 ảnh', group: 'odd', cols: 2, rows: 2, url: 'frames/odd/3img.html' },
    { id: '4img', name: 'Khung 4 ảnh', group: 'even', cols: 2, rows: 2, url: 'frames/even/4img.html' },
    { id: '6img', name: 'Khung 6 ảnh', group: 'even', cols: 3, rows: 2, url: 'frames/even/6img.html' },
    { id: '9img', name: 'Khung 9 ảnh', group: 'odd', cols: 3, rows: 3, url: 'frames/odd/9img.html' },
];

let _showToast = () => {};

export function initFrameExporter({ showToast } = {}) {
    if (typeof showToast === 'function') _showToast = showToast;
}

// —— Vẽ ảnh phủ kín 1 ô (giữ tỉ lệ, crop giữa — tương đương object-fit: cover)
function drawImageCover(ctx, img, dx, dy, dw, dh) {
    const scale = Math.max(dw / img.width, dh / img.height);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// —— Fetch file khung HTML → danh sách slot {x, y, w, h} theo %, sort theo data-slot
async function parseFrameSlots(frameUrl) {
    const res = await fetch(frameUrl);
    if (!res.ok) throw new Error(`Không tải được khung (${res.status})`);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    return Array.from(doc.querySelectorAll('.frame .fs'))
        .map((el) => {
            const pct = (v, fallback) => {
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : fallback;
            };
            const style = el.style;
            return {
                slot: parseInt(el.dataset.slot || '0', 10),
                x: pct(style.left, 0),
                y: pct(style.top, 0),
                w: pct(style.width, 100),
                h: pct(style.height, 100),
            };
        })
        .sort((a, b) => a.slot - b.slot);
}

// —— Tải blob về máy
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// —— Ghép ảnh vào khung và xuất PNG
export async function exportWithFrame(frame, imageUrl) {
    _showToast('Đang tạo ảnh xuất... ⏳', true);

    const [slots, img] = await Promise.all([
        parseFrameSlots(frame.url),
        loadImage(imageUrl),
    ]);

    if (!slots.length) throw new Error('Khung không có ô ảnh nào');

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d');

    // Nền đen đồng bộ app
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    // Cùng 1 ảnh nhân bản vào mọi ô
    for (const s of slots) {
        drawImageCover(
            ctx,
            img,
            (s.x / 100) * EXPORT_SIZE,
            (s.y / 100) * EXPORT_SIZE,
            (s.w / 100) * EXPORT_SIZE,
            (s.h / 100) * EXPORT_SIZE
        );
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Không tạo được file PNG');

    downloadBlob(blob, `locket_${frame.id}_${Date.now()}.png`);
    _showToast(`Đã xuất ${frame.name.toLowerCase()} về máy! 🖼️`, true);
}

// —— Menu chọn dạng xuất (overlay glassmorphism)
let _menuEl = null;

function ensureMenu() {
    if (_menuEl) return _menuEl;

    _menuEl = document.createElement('div');
    _menuEl.className = 'modal-overlay d-none';
    _menuEl.id = 'frame-menu-overlay';
    _menuEl.innerHTML = `
        <div class="modal-panel glass-panel frame-menu-panel">
            <div class="modal-header">
                <h5><i class="bi bi-images text-warning"></i> Xuất hình — chọn khung</h5>
                <button class="modal-close-btn" type="button" aria-label="Đóng">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <p class="frame-menu-hint">Ảnh sẽ được nhân bản vào tất cả các ô của khung</p>
            <div class="frame-menu-grid"></div>
        </div>
    `;
    document.body.appendChild(_menuEl);

    // Đóng menu
    _menuEl.addEventListener('click', (e) => {
        if (e.target === _menuEl || e.target.closest('.modal-close-btn')) {
            closeExportMenu();
        }
    });

    // Render các option khung
    const grid = _menuEl.querySelector('.frame-menu-grid');
    for (const frame of FRAMES) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'frame-option';
        option.dataset.frameId = frame.id;

        const thumb = document.createElement('span');
        thumb.className = 'frame-thumb';
        thumb.style.gridTemplateColumns = `repeat(${frame.cols}, 1fr)`;
        thumb.style.gridTemplateRows = `repeat(${frame.rows}, 1fr)`;
        for (let i = 0; i < frame.cols * frame.rows; i++) {
            const cell = document.createElement('i');
            cell.className = 'frame-thumb-cell';
            thumb.appendChild(cell);
        }

        const name = document.createElement('span');
        name.className = 'frame-option-name';
        name.textContent = frame.name;

        const group = document.createElement('span');
        group.className = 'frame-option-group';
        group.textContent = frame.group === 'odd' ? 'Lẻ' : 'Chẵn';

        option.append(thumb, name, group);

        option.addEventListener('click', async () => {
            const imageUrl = _menuEl.dataset.imageUrl;
            closeExportMenu();
            if (!imageUrl) return;
            try {
                await exportWithFrame(frame, imageUrl);
            } catch (err) {
                console.error('Export frame error:', err);
                _showToast('Xuất ảnh thất bại: ' + err.message, false);
            }
        });

        grid.appendChild(option);
    }

    return _menuEl;
}

export function openExportMenu({ imageUrl } = {}) {
    const menu = ensureMenu();
    if (!imageUrl) {
        _showToast('Chưa có ảnh để xuất!', false);
        return;
    }
    menu.dataset.imageUrl = imageUrl;
    menu.classList.remove('d-none');
}

export function closeExportMenu() {
    _menuEl?.classList.add('d-none');
}
