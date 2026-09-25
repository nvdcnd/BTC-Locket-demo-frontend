// =====================================================
// CLIENT-SIDE IMAGE COMPRESSION
// Mục tiêu: mọi ảnh gửi lên ImageKit phải <= 50 KB (50 * 1024 bytes).
// Không phụ thuộc thư viện ngoài; dùng Canvas + WebP, fallback JPEG.
// =====================================================

export const MAX_UPLOAD_BYTES = 50 * 1024; // 50 KiB
const MAX_SOURCE_DIMENSION = 1920;
const MIN_DIMENSION = 32;
const QUALITY_LEVELS = [0.86, 0.78, 0.70, 0.62, 0.54, 0.46, 0.38, 0.30, 0.22, 0.14];

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
}

/**
 * Kiểm tra bất biến ngay trước lúc gọi API.
 * Dùng ở cả file input, camera và uploadPost để không có đường bypass FE.
 */
export function assertUploadableImage(blob, maxBytes = MAX_UPLOAD_BYTES) {
    if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Ảnh không hợp lệ hoặc đang rỗng!');
    }
    if (blob.type && !blob.type.startsWith('image/')) {
        throw new Error('Chỉ được chọn tệp ảnh (JPG, PNG hoặc WebP)!');
    }
    if (blob.size > maxBytes) {
        throw new Error(
            `Ảnh sau nén vẫn ${formatBytes(blob.size)}, vượt giới hạn ${formatBytes(maxBytes)}. ` +
            'Vui lòng chọn ảnh khác hoặc thử lại.'
        );
    }
    return true;
}

function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Trình duyệt không tạo được ảnh đã nén.'));
            }, mimeType, quality);
        } catch (error) {
            reject(error);
        }
    });
}

function fitDimensions(width, height, maxDimension) {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return {
        width: Math.max(MIN_DIMENSION, Math.round(width * scale)),
        height: Math.max(MIN_DIMENSION, Math.round(height * scale)),
    };
}

async function decodeImage(blob) {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
            return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
        } catch (_) {
            // Safari/old browser: fallback sang <img> ở bên dưới.
        }
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Không đọc được tệp ảnh. Hãy thử một ảnh khác!'));
            img.src = objectUrl;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            cleanup: () => URL.revokeObjectURL(objectUrl),
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
}

async function detectOutputMime() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    const webp = await canvasToBlob(canvas, 'image/webp', 0.8);
    if (webp.type === 'image/webp') return 'image/webp';
    return 'image/jpeg';
}

/**
 * Nén ảnh trong browser và trả về Blob đã đạt giới hạn.
 * Nếu ảnh đã <= 50 KB, vẫn giữ luồng kiểm tra upload ở api.js.
 */
export async function compressImageToTarget(blob, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
    if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Ảnh không hợp lệ hoặc đang rỗng!');
    }
    if (blob.type && !blob.type.startsWith('image/')) {
        throw new Error('Tệp được chọn không phải ảnh!');
    }
    if (maxBytes <= 0) throw new Error('Giới hạn dung lượng ảnh không hợp lệ.');

    const originalSize = blob.size;
    const decoded = await decodeImage(blob);
    if (!decoded.width || !decoded.height) {
        decoded.cleanup();
        throw new Error('Ảnh không có kích thước hợp lệ!');
    }

    // Vẫn decode file nhỏ để kiểm tra nội dung thực sự là ảnh, không chỉ tin vào MIME.
    if (originalSize <= maxBytes) {
        try {
            assertUploadableImage(blob, maxBytes);
            return { blob, originalSize, finalSize: originalSize, mimeType: blob.type, width: decoded.width, height: decoded.height };
        } finally {
            decoded.cleanup();
        }
    }

    let mimeType;
    let dimensions;
    let best = null;

    try {
        mimeType = await detectOutputMime();
        dimensions = fitDimensions(decoded.width, decoded.height, MAX_SOURCE_DIMENSION);
        // Mỗi vòng thử quality trước; nếu ảnh phức tạp vẫn lớn thì giảm tiếp cả kích thước.
        for (let pass = 0; pass < 7; pass += 1) {
            const canvas = document.createElement('canvas');
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            const ctx = canvas.getContext('2d', { alpha: mimeType === 'image/webp' });

            if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
            if (mimeType === 'image/jpeg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

            for (const quality of QUALITY_LEVELS) {
                const encoded = await canvasToBlob(canvas, mimeType, quality);
                if (!best || encoded.size < best.size) best = encoded;
                if (encoded.size <= maxBytes) {
                    assertUploadableImage(encoded, maxBytes);
                    return {
                        blob: encoded,
                        originalSize,
                        finalSize: encoded.size,
                        mimeType: encoded.type || mimeType,
                        width: canvas.width,
                        height: canvas.height,
                    };
                }
            }

            dimensions = {
                width: Math.max(MIN_DIMENSION, Math.floor(dimensions.width * 0.8)),
                height: Math.max(MIN_DIMENSION, Math.floor(dimensions.height * 0.8)),
            };
        }

        if (best && best.size <= maxBytes) {
            assertUploadableImage(best, maxBytes);
            return {
                blob: best,
                originalSize,
                finalSize: best.size,
                mimeType: best.type || mimeType,
                width: dimensions.width,
                height: dimensions.height,
            };
        }

        throw new Error(
            `Không thể nén ảnh xuống ${formatBytes(maxBytes)}. Ảnh quá chi tiết, vui lòng thử ảnh khác!`
        );
    } finally {
        decoded.cleanup();
    }
}
