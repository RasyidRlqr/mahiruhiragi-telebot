const { Composer, InputFile } = require('grammy');
const composer = new Composer();
const tikTokTimeoutMs = 60_000;
const pinterestTimeoutMs = 30_000;
const maxPinterestImageBytes = 10 * 1024 * 1024;
const tikTokApiUrl = new URL('https://tikwm.com/api/');

class DownloadError extends Error {}

const validateSourceUrl = (value) => {
    let url;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;

    const hostname = url.hostname.toLowerCase();
    const isSupportedHost = ['tiktok.com', 'instagram.com', 'instagr.am']
        .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    return isSupportedHost ? url : undefined;
};

const isTikTokUrl = (url) => {
    const hostname = url.hostname.toLowerCase();
    return hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com');
};

const validateServiceUrl = (value, domains, exactHosts = []) => {
    let url;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;

    const hostname = url.hostname.toLowerCase();
    const isAllowedHost = exactHosts.includes(hostname) ||
        domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    return isAllowedHost ? url : undefined;
};

const validatePinterestImageUrl = (value) => {
    let url;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'i.pinimg.com' ||
        url.username || url.password || url.port) {
        return undefined;
    }
    return url;
};

const isPinterestHost = (hostname) => {
    const host = hostname.toLowerCase();
    return host === 'pin.it' || host === 'api.pinterest.com' ||
        host === 'pinterest.com' || host.endsWith('.pinterest.com');
};

const resolvePinterestShortUrl = async (url) => {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
        const response = await fetch(currentUrl, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000)
        });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) {
            return currentUrl.href;
        }

        let nextUrl;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            throw new DownloadError('Tautan pendek Pinterest mengarah ke URL yang tidak valid.');
        }
        if (nextUrl.protocol !== 'https:' || nextUrl.username || nextUrl.password ||
            nextUrl.port || !isPinterestHost(nextUrl.hostname)) {
            throw new DownloadError('Pengalihan tautan Pinterest keluar dari domain yang diizinkan.');
        }
        currentUrl = nextUrl;
    }

    throw new DownloadError('Tautan pendek Pinterest terlalu banyak melakukan pengalihan.');
};

const getPinterestImage = async (url) => {
    const response = await fetch(url, {
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
        redirect: 'manual',
        signal: AbortSignal.timeout(pinterestTimeoutMs)
    });
    if (response.status >= 300 && response.status < 400) {
        throw new DownloadError('URL gambar Pinterest mengarah ke redirect yang tidak diizinkan.');
    }
    if (!response.ok) {
        throw new DownloadError(`Gambar Pinterest gagal diambil (HTTP ${response.status}).`);
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    const extension = extensions[contentType];
    if (!extension) {
        throw new DownloadError('URL tersebut tidak mengembalikan gambar JPEG, PNG, atau WebP.');
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxPinterestImageBytes) {
        throw new DownloadError('Ukuran gambar melebihi batas 10 MB.');
    }
    if (!response.body) {
        throw new DownloadError('Respons gambar Pinterest kosong.');
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxPinterestImageBytes) {
            await reader.cancel();
            throw new DownloadError('Ukuran gambar melebihi batas 10 MB.');
        }
        chunks.push(Buffer.from(value));
    }
    if (totalBytes === 0) {
        throw new DownloadError('Respons gambar Pinterest kosong.');
    }

    return {
        buffer: Buffer.concat(chunks, totalBytes),
        contentType,
        filename: `pinterest-image.${extension}`
    };
};

const processPinterestInput = async (ctx, input) => {
    if (!ctx.authorizedChats?.has(ctx.chat.id)) {
        await ctx.reply('🔒 Grup/chat ini belum diizinkan owner untuk menggunakan fitur download. Minta owner menjalankan /auth di grup.');
        return;
    }

    const imageUrl = validatePinterestImageUrl(input);
    const pinUrl = imageUrl ? undefined : validateServiceUrl(input, ['pinterest.com'], ['pin.it', 'api.pinterest.com']);
    if (!imageUrl && !pinUrl) {
        await ctx.reply('Gunakan URL gambar langsung i.pinimg.com atau tautan Pinterest/pin.it.');
        return;
    }

    let statusMessage;
    try {
        if (imageUrl) {
            statusMessage = await ctx.reply('⏳ Mengambil gambar Pinterest...');
            const image = await getPinterestImage(imageUrl);
            if (image.contentType === 'image/jpeg') {
                await ctx.replyWithPhoto(image.buffer, { caption: '✅ Gambar Pinterest' });
            } else {
                await ctx.replyWithDocument(new InputFile(image.buffer, image.filename), {
                    caption: '✅ Gambar Pinterest'
                });
            }
            return;
        }

        statusMessage = await ctx.reply('⏳ Membuka tautan Pinterest...');
        const resolvedUrl = await resolvePinterestShortUrl(pinUrl);
        await replyWithOfficialLink(
            ctx,
            'Pinterest',
            new URL(resolvedUrl),
            '/download https://pin.it/... atau /pinterest https://pin.it/...',
            'URL halaman Pin dibagikan sebagai tautan. Untuk mengirim gambar langsung, gunakan URL gambar i.pinimg.com.'
        );
    } catch (error) {
        console.error('Gagal memproses tautan Pinterest:', error);
        const message = error.name === 'TimeoutError'
            ? '⏱️ Pinterest terlalu lama merespons. Coba lagi nanti.'
            : error instanceof DownloadError
                ? `❌ ${error.message}`
                : '❌ Gagal mengambil gambar atau membuka tautan Pinterest.';
        await ctx.reply(message);
    } finally {
        if (statusMessage) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (error) {
                console.error('Gagal menghapus status Pinterest:', error);
            }
        }
    }
};

const replyWithOfficialLink = async (ctx, service, url, usage, explanation) => {
    if (!ctx.authorizedChats?.has(ctx.chat.id)) {
        await ctx.reply('🔒 Grup/chat ini belum diizinkan owner untuk menggunakan fitur download. Minta owner menjalankan /auth di grup.');
        return;
    }

    const sourceUrl = url && url.href;
    if (!sourceUrl) {
        await ctx.reply(`Gunakan format:\n${usage}`);
        return;
    }

    await ctx.reply(`🔗 Tautan ${service}:\n${sourceUrl}\n${explanation}`, {
        reply_markup: {
            inline_keyboard: [[{ text: `Buka ${service}`, url: sourceUrl }]]
        }
    });
};

const validateMediaUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
    } catch {
        return undefined;
    }
};

const resolveTikTokShortUrl = async (url) => {
    const shortHosts = ['vt.tiktok.com', 'vm.tiktok.com'];
    if (!shortHosts.includes(url.hostname.toLowerCase())) return url.href;

    let currentUrl = url;
    for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
        const response = await fetch(currentUrl, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000)
        });
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) {
            return currentUrl.href;
        }

        let nextUrl;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            throw new DownloadError('Tautan pendek TikTok mengarah ke URL yang tidak valid.');
        }
        if (!validateSourceUrl(nextUrl.href) || !isTikTokUrl(nextUrl)) {
            throw new DownloadError('Pengalihan tautan pendek keluar dari domain TikTok; request dihentikan.');
        }
        currentUrl = nextUrl;
    }

    throw new DownloadError('Tautan pendek TikTok terlalu banyak melakukan pengalihan.');
};

const getTikTokResult = async (url) => {
    const resolvedUrl = await resolveTikTokShortUrl(url);
    const response = await fetch(tikTokApiUrl, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ url: resolvedUrl, hd: '1' }),
        signal: AbortSignal.timeout(tikTokTimeoutMs)
    });

    if (!response.ok) {
        throw new DownloadError(`TikWM gagal memproses tautan (HTTP ${response.status}).`);
    }

    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new DownloadError(`Respons TikWM bukan JSON (HTTP ${response.status}).`, { cause: error });
    }
    if (!result || typeof result !== 'object' || Number(result.code) !== 0 || !result.data) {
        throw new DownloadError(result?.msg || 'TikWM tidak dapat memproses tautan ini.');
    }

    const data = result.data;
    const videoUrl = validateMediaUrl(data.hdplay || data.play || data.wmplay);
    if (videoUrl) {
        return {
            type: 'video',
            url: videoUrl,
            title: data.title || data.author?.unique_id || undefined
        };
    }

    const photoUrls = Array.isArray(data.images)
        ? data.images.map((image) => validateMediaUrl(typeof image === 'string' ? image : image?.url)).filter(Boolean)
        : [];
    if (photoUrls.length > 0) {
        return {
            type: 'photos',
            urls: photoUrls.slice(0, 8),
            title: data.title || data.author?.unique_id || undefined
        };
    }

    throw new DownloadError('TikWM tidak mengembalikan tautan video atau foto yang valid.');
};

composer.command('download', async (ctx) => {
    if (!ctx.authorizedChats?.has(ctx.chat.id)) {
        await ctx.reply('🔒 Grup/chat ini belum diizinkan owner untuk menggunakan fitur download. Minta owner menjalankan /auth di grup.');
        return;
    }

    const input = String(ctx.match || '').trim();
    if (validatePinterestImageUrl(input) || validateServiceUrl(input, ['pinterest.com'], ['pin.it', 'api.pinterest.com'])) {
        await processPinterestInput(ctx, input);
        return;
    }

    const sourceUrl = validateSourceUrl(input);
    if (!sourceUrl) {
        await ctx.reply('Kirim tautan TikTok, Instagram, Pinterest, atau URL gambar i.pinimg.com. Contoh:\n/download https://www.tiktok.com/@user/video/123456');
        return;
    }

    const isTikTok = isTikTokUrl(sourceUrl);
    if (!isTikTok) {
        await replyWithOfficialLink(
            ctx,
            'Instagram',
            sourceUrl,
            '/download https://www.instagram.com/reel/...',
            'Unduhan otomatis Instagram belum tersedia. SaveIG sedang merespons HTTP 530, dan bot tidak mencoba melewati proteksi provider. Buka postingan di Instagram atau gunakan aplikasi/situs resminya.'
        );
        return;
    }

    const providerName = 'TikWM';
    let statusMessage;
    try {
        statusMessage = await ctx.reply('⏳ Memproses tautan TikTok...');
        const result = await getTikTokResult(sourceUrl);
        await sendTikTokResult(ctx, result);
    } catch (error) {
        if (error instanceof DownloadError) {
            console.warn(`Unduhan TikTok ditolak oleh ${providerName}: ${error.message}`);
        } else {
            console.error(`Gagal memproses unduhan TikTok (${providerName}):`, error);
        }
        const networkErrorCode = error.cause?.code || error.cause?.cause?.code;
        const message = error.name === 'TimeoutError'
            ? `⏱️ ${providerName} terlalu lama merespons. Coba lagi nanti.`
            : error instanceof DownloadError
                ? `❌ ${error.message}`
                : networkErrorCode === 'ENOTFOUND'
                    ? '❌ DNS TikWM tidak ditemukan. Pastikan host bot dapat mengakses tikwm.com.'
                : '❌ Gagal menghubungi atau memproses tautan TikTok. Periksa log bot dan coba lagi.';
        await ctx.reply(message);
    } finally {
        if (statusMessage) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (error) {
                console.error('Gagal menghapus status download:', error);
            }
        }
    }
});

const sendTikTokResult = async (ctx, result) => {
    if (result.type === 'photos') {
        for (const [index, mediaUrl] of result.urls.entries()) {
            try {
                await ctx.replyWithPhoto(mediaUrl, {
                    caption: index === 0 && result.title ? `✅ ${result.title}`.slice(0, 900) : undefined
                });
            } catch (error) {
                console.error(`Telegram gagal mengambil foto TikTok ${index + 1} dari TikWM:`, error);
                await ctx.reply('Telegram tidak dapat mengambil foto secara langsung. Buka tautan hasil TikWM:', {
                    reply_markup: {
                        inline_keyboard: [[{ text: `⬇️ Buka foto ${index + 1}`, url: mediaUrl }]]
                    }
                });
            }
        }
        return;
    }

    try {
        const options = {
            caption: result.title ? `✅ ${result.title}`.slice(0, 900) : '✅ Media TikTok'
        };
        if (result.type === 'photo') {
            await ctx.replyWithPhoto(result.url, options);
        } else {
            await ctx.replyWithVideo(result.url, { ...options, supports_streaming: true });
        }
    } catch (error) {
        console.error(`Telegram gagal mengambil media TikWM (${result.type}):`, error);
        await ctx.reply('Telegram tidak dapat mengambil media secara langsung. Coba tautan hasil TikWM ini:', {
            reply_markup: {
                inline_keyboard: [[{ text: '⬇️ Buka media', url: result.url }]]
            }
        });
    }
};

composer.command('pinterest', async (ctx) => {
    await processPinterestInput(ctx, String(ctx.match || '').trim());
});

module.exports = composer;
