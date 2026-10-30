// Validate encoded headers BEFORE any browser image decoder allocates pixels.
// Deliberately accept raster PNG, JPEG, WebP and GIF only (first frame).
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 16 * 1024 * 1024; // at most 64 MiB of source RGBA
export const MAX_EDGE = 8192;
const invalid = () => new Error('Use a valid PNG, JPEG, WebP or GIF image.');

export function imageDimensions(buffer) {
    const a = new Uint8Array(buffer), v = new DataView(buffer);
    const text = (i, n) => String.fromCharCode(...a.subarray(i, i + n));
    if (a.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1a\n' && text(12, 4) === 'IHDR' && v.getUint32(8) === 13) {
        return [v.getUint32(16), v.getUint32(20)];
    }
    if (a.length >= 10 && ['GIF87a', 'GIF89a'].includes(text(0, 6))) {
        const width = v.getUint16(6, true), height = v.getUint16(8, true);
        validateDimensions(width, height);
        // Logical screen dimensions alone are not sufficient: frames have dimensions too.
        let i = 13 + (a[10] & 128 ? 3 * (1 << ((a[10] & 7) + 1)) : 0), frames = 0;
        const skipBlocks = () => {
            while (i < a.length) { const size = a[i++]; if (!size) return; i += size; }
            throw invalid();
        };
        while (i < a.length) {
            const kind = a[i++];
            if (kind === 59) break;
            if (kind === 33) { i++; skipBlocks(); continue; }
            if (kind !== 44 || i + 9 > a.length) throw invalid();
            const x = v.getUint16(i, true), y = v.getUint16(i + 2, true);
            const w = v.getUint16(i + 4, true), h = v.getUint16(i + 6, true), flags = a[i + 8];
            validateDimensions(w, h);
            if (x + w > width || y + h > height || ++frames > 120 || frames * width * height > MAX_PIXELS) throw invalid();
            i += 9 + (flags & 128 ? 3 * (1 << ((flags & 7) + 1)) : 0);
            i++; skipBlocks(); // LZW code size, then bounded compressed sub-blocks
        }
        if (!frames) throw invalid();
        return [width, height];
    }
    if (a.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
        const u24 = i => a[i] | a[i + 1] << 8 | a[i + 2] << 16;
        let dimensions = null;
        for (let i = 12; i + 8 <= a.length;) {
            const kind = text(i, 4), len = v.getUint32(i + 4, true), data = i + 8;
            if (data + len > a.length) throw invalid();
            let size;
            if (kind === 'VP8X' && len >= 10) {
                if (a[data] & 2) throw new Error('Use a valid PNG, JPEG, WebP or GIF image; animated WebP is not supported.');
                size = [u24(data + 4) + 1, u24(data + 7) + 1];
            }
            if (kind === 'VP8 ' && len >= 10 && text(data + 3, 3) === '\x9d\x01\x2a') size = [v.getUint16(data + 6, true) & 16383, v.getUint16(data + 8, true) & 16383];
            if (kind === 'VP8L' && len >= 5 && a[data] === 47) size = [1 + (a[data + 1] | (a[data + 2] & 63) << 8), 1 + (a[data + 2] >> 6 | a[data + 3] << 2 | (a[data + 4] & 15) << 10)];
            if (size) {
                validateDimensions(...size);
                if (dimensions && (dimensions[0] !== size[0] || dimensions[1] !== size[1])) throw invalid();
                dimensions = size;
            }
            i = data + len + (len & 1);
        }
        if (dimensions) return dimensions;
    }
    if (a.length >= 4 && a[0] === 255 && a[1] === 216) {
        let i = 2;
        while (i + 3 < a.length) {
            if (a[i++] !== 255) throw invalid();
            while (a[i] === 255) i++;
            const marker = a[i++];
            if (marker === 218 || marker === 217) break;
            if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
            if (i + 2 > a.length) break;
            const len = v.getUint16(i);
            if (len < 2 || i + len > a.length) break;
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && len >= 8) {
                return [v.getUint16(i + 5), v.getUint16(i + 3)];
            }
            i += len;
        }
    }
    throw invalid();
}

export function validateDimensions(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
        throw new Error('Pick an image up to 16 megapixels, with neither side over 8192 pixels.');
    }
}

export async function decodeImage(source) {
    if (!(source instanceof Blob)) throw invalid();
    if (source.size > MAX_FILE_BYTES) throw new Error('Pick an image under 20 MB.');
    // Encoded bytes are bounded too. Inspect GIF frames/WebP chunks without decoding.
    const [width, height] = imageDimensions(await source.arrayBuffer());
    validateDimensions(width, height);
    // Keep EXIF orientation and the original sampling/filtering behavior. Dimensions
    // cap decoder RGBA before allocation; main.js then samples a <=640px canvas.
    const bitmap = await createImageBitmap(source);
    try {
        validateDimensions(bitmap.width, bitmap.height);
        return bitmap;
    } catch (error) { bitmap.close(); throw error; }
}
