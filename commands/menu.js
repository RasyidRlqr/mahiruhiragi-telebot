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

    const isOwner = ctx.from.id === ctx.ownerId;
    const isPrivate = ctx.chat.type === 'private';
    const keyboard = [[{ text: '👤 Profil Saya', callback_data: 'profile' }]];

    if (isOwner && isPrivate) {
        keyboard.push([{ text: '🔐 Menu Owner', callback_data: 'owner_menu' }]);
    }

    await ctx.reply(
        '🤖 <b>Menu Bot Mahiru Hiragi</b>\n\n' +
        'Pilih fitur yang ingin digunakan:\n' +
        '/start - Mulai bot\n' +
        '/download - Download video (memerlukan izin)\n' +
        '/rules - Lihat rules grup\n' +
        '/rules edit - Ubah rules (admin)\n' +
        '/rules delete - Hapus rules (admin)\n' +
        '/notes nama_note - Lihat note\n' +
        '/notes edit nama_note - Buat/ubah note (admin)\n' +
        '/notes delete nama_note - Hapus note (admin)\n' +
        '/cancel - Batalkan proses edit',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
    );
});

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
