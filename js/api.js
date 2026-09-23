// =====================================================
// LỚP API DUY NHẤT — mọi call tới backend FastAPI đi qua đây
// GET  /images/        → { items, total, next_page, ... } (cursor pagination)
// POST /upload/image/  → multipart/form-data { image, description?, name? }
// =====================================================

// "" nếu mở app qua chính server FastAPI (http://localhost:8000).
// Nếu serve FE riêng (VD Live Server :5500) thì đổi thành "http://localhost:8000".
const API_BASE = "";

const USER_NAME_KEY = "locket_user_name";
const DEFAULT_USER_NAME = "Người trải nghiệm";

// ---------------- Tên user (localStorage, không cần login) ----------------

export function getUserName() {
    return localStorage.getItem(USER_NAME_KEY) || "";
}

export function setUserName(name) {
    const trimmed = (name || "").trim().slice(0, 50);
    if (!trimmed) return false;
    localStorage.setItem(USER_NAME_KEY, trimmed);
    return true;
}

export function hasUserName() {
    return getUserName().length > 0;
}

// ---------------- GET feed (cursor pagination) ----------------

/**
 * Lấy 1 trang feed. Trả về { items, total, next_page }.
 * items: [{ id, url, name, description, created_at }]
 * next_page: cursor (string) cho trang kế — null khi hết data.
 */
export async function getFeed({ cursor = null, size = 10 } = {}) {
    const url = `${API_BASE}/images/?size=${size}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Không tải được feed (${res.status})`);

    const page = await res.json();
    return {
        items: Array.isArray(page.items) ? page.items : [],
        total: typeof page.total === "number" ? page.total : 0,
        next_page: page.next_page || null,
    };
}

// ---------------- POST upload ảnh (FormData) ----------------

/**
 * Đăng 1 ảnh lên feed.
 * @param {Blob|File} blob   dữ liệu ảnh (từ canvas hoặc file input)
 * @param {string} caption   mô tả (tuỳ chọn)
 * @param {string} name      tên người đăng
 * @returns object image vừa tạo: { id, url, name, description, created_at }
 */
export async function uploadPost({ blob, caption = "", name } = {}) {
    const fd = new FormData();
    // key "image" phải khớp tham số UploadFile của backend
    fd.append("image", blob, `photo_${Date.now()}.jpg`);
    if (caption) fd.append("description", caption);
    fd.append("name", name || getUserName() || DEFAULT_USER_NAME);

    const res = await fetch(`${API_BASE}/upload/image/`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const detail = Array.isArray(data?.detail) ? "Dữ liệu gửi lên không hợp lệ" : (data?.detail || "");
        throw new Error(detail || `Đăng ảnh thất bại (${res.status})`);
    }
    return data.image;
}

// Tiện ích chung: chuyển URL ảnh → Image object (dùng cho compositor frame)
export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // cần để canvas không bị tainted khi xuất PNG
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Không tải được ảnh: " + url));
        img.src = url;
    });
}
