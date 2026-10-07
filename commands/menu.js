const { Composer } = require('grammy');
const composer = new Composer();
const startMessages = new Map();

const startMessageKey = (ctx) => `${ctx.chat.id}:${ctx.from.id}`;

const deleteStartMessage = async (ctx) => {
    const key = startMessageKey(ctx);
    const messageId = startMessages.get(key);
    if (!messageId) return;

    try {
        await ctx.api.deleteMessage(ctx.chat.id, messageId);
        startMessages.delete(key);
    } catch (error) {
        console.error(`Gagal menghapus pesan /start (${ctx.chat.id}/${messageId}):`, error);
    }
};

const mainMenuKeyboard = (ctx) => {
    const keyboard = [
        [
            { text: '📜 Rules', callback_data: 'menu_rules' },
            { text: '📝 Notes', callback_data: 'menu_notes' }
        ],
        [
            { text: '⬇️ Download', callback_data: 'menu_download' },
            { text: '👤 Profil', callback_data: 'profile' }
        ]
    ];

    if (ctx.from.id === ctx.ownerId && ctx.chat.type === 'private') {
        keyboard.push([{ text: '🔐 Menu Owner', callback_data: 'owner_menu' }]);
    }
    return { inline_keyboard: keyboard };
};

const showMenuCategory = async (ctx, text) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Kembali ke Menu', callback_data: 'menu_home' }]]
        }
    });
};

const showDownloadMenu = async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('<b>⬇️ Download &amp; Tautan</b>\nPilih layanan:', {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🎵 TikTok', callback_data: 'menu_download_tiktok' },
                    { text: '📸 Instagram', callback_data: 'menu_download_instagram' },
                    { text: '📌 Pinterest', callback_data: 'menu_download_pinterest' }
                ],
                [{ text: '⬅️ Kembali ke Menu', callback_data: 'menu_home' }]
            ]
        }
    });
};

const showDownloadService = (text) => async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅️ Kembali ke Layanan', callback_data: 'menu_download' }],
                [{ text: '🏠 Kembali ke Menu', callback_data: 'menu_home' }]
            ]
        }
    });
};

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const showProfile = async (ctx) => {
    const user = ctx.from;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    const username = user.username ? `@${user.username}` : 'Tidak tersedia';
    const message = [
        '<b>👤 Profil Telegram</b>',
        '',
        `<b>Nama:</b> ${escapeHtml(fullName)}`,
        `<b>Username:</b> ${escapeHtml(username)}`,
        `<b>ID:</b> <code>${user.id}</code>`,
        '<b>Negara:</b> Tidak tersedia dari data profil Telegram'
    ].join('\n');

    const photos = await ctx.api.getUserProfilePhotos(user.id, { offset: 0, limit: 1 });
    const profilePhoto = photos.photos[0];
    if (profilePhoto && profilePhoto.length > 0) {
        const photoFileId = profilePhoto[profilePhoto.length - 1].file_id;
        await ctx.replyWithPhoto(photoFileId, { caption: message, parse_mode: 'HTML' });
    } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
    }
};

composer.command('menu', async (ctx) => {
    await deleteStartMessage(ctx);

    await ctx.reply(
        '🤖 <b>Menu Mahiru</b>\nPilih kategori:',
        { parse_mode: 'HTML', reply_markup: mainMenuKeyboard(ctx) }
    );
});

composer.callbackQuery('menu_home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🤖 <b>Menu Mahiru</b>\nPilih kategori:', {
        parse_mode: 'HTML',
        reply_markup: mainMenuKeyboard(ctx)
    });
});

composer.callbackQuery('menu_rules', (ctx) => showMenuCategory(
    ctx,
    '<b>📜 Rules</b>\n/rules - Lihat rules grup\n/rules edit isi rules - Simpan langsung\n/rules edit - Lalu kirim rules baru\n/rules delete - Hapus rules (admin grup)'
));

composer.callbackQuery('menu_notes', (ctx) => showMenuCategory(
    ctx,
    '<b>📝 Notes</b>\n/notes - Daftar semua notes\n/get nama - Tampilkan note\n#nama - Pintasan note\n/save nama isi - Simpan note (admin)\nBalas media dengan /save nama untuk menyimpannya\n/clear nama dan /clearall - Hapus notes (admin)\n/privatenotes on|off - Atur balasan PM (admin)\n/connect di grup atau /connect ID_GRUP di PM\n/disconnect - Putuskan koneksi PM\nJika #nama tidak direspons, aktifkan Group Privacy off di BotFather atau jadikan bot admin. Alternatif: #nama@username_bot.'
));

composer.callbackQuery('menu_download', showDownloadMenu);
composer.callbackQuery('menu_download_tiktok', showDownloadService(
    '<b>🎵 TikTok</b>\n/download https://www.tiktok.com/@user/video/123456\nMengambil video/foto melalui TikWM. Hanya untuk konten yang boleh Anda simpan; perlu otorisasi bot di chat.'
));
composer.callbackQuery('menu_download_instagram', showDownloadService(
    '<b>📸 Instagram</b>\n/download https://www.instagram.com/reel/...\nBot membagikan tautan postingan Instagram. Unduhan otomatis belum tersedia karena endpoint SaveIG merespons HTTP 530.'
));
composer.callbackQuery('menu_download_pinterest', showDownloadService(
    '<b>📌 Pinterest</b>\n/download https://i.pinimg.com/736x/...jpg\natau /download https://pin.it/...\nURL gambar langsung dikirim sebagai gambar. Link halaman Pin dibuka lalu dibagikan; bot tidak mengekstrak medianya.'
));

composer.command('profile', showProfile);
composer.callbackQuery('profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProfile(ctx);
});

composer.command('start', async (ctx) => {
    await deleteStartMessage(ctx);

    const isOwner = ctx.from.id === ctx.ownerId;
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const state = require('./state');
    state.addUser(ctx.from.id);

    const message = `🎉 <b>Bot Mahiru Hiragi sudah aktif!</b>\n\n` +
        `👤 User: ${escapeHtml(userName)}\n` +
        `🔑 Owner: ${isOwner ? 'Ya' : 'Tidak'}\n` +
        `🏠 Grup/Chat: <code>${ctx.chat.id}</code>\n\n` +
        'Selamat datang! Ketik /menu untuk melihat fitur bot.';
    const keyboard = [[{ text: '👤 Profil Saya', callback_data: 'profile' }]];

    if (isOwner && ctx.chat.type === 'private') {
        keyboard.push([{ text: '🔐 Menu Owner', callback_data: 'owner_menu' }]);
    }

    const sentMessage = await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
    startMessages.set(startMessageKey(ctx), sentMessage.message_id);
});

module.exports = { composer };
