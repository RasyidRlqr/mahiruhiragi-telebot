const { Composer } = require('grammy');
const composer = new Composer();
const contentStore = require('./contentStore');

composer.command('auth', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    if (userId !== ctx.ownerId) {
        return ctx.reply("❌ Maaf, hanya Owner yang dapat menggunakan perintah ini.");
    }

    if (String(ctx.match || '').trim().toLowerCase() === 'list') {
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Gunakan /auth list di chat pribadi dengan bot agar daftar grup tidak tampil di grup.');
        }

        const chats = contentStore.getAuthorizedChats();
        if (chats.length === 0) {
            return ctx.reply('📋 Belum ada chat/grup yang diizinkan.');
        }

        const list = chats
            .map((chat) => `• ${chat.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')} — <code>${chat.chatId}</code>`)
            .join('\n');
        return ctx.reply(`<b>📋 Daftar Chat/Grup Diizinkan</b>\n\n${list}\n\nCabut akses: /unauth ID_CHAT`, {
            parse_mode: 'HTML'
        });
    }

    if (ctx.authorizedChats.has(chatId)) {
        return ctx.reply("✅ Chat ini sudah diizinkan (authorized) sebelumnya.");
    }

    ctx.authorizedChats.add(chatId);
    contentStore.saveAuthorizedChat(chatId, ctx.chat.title || ctx.chat.first_name || String(chatId), ctx.chat.type);
    await ctx.reply("✅ Chat/Grup ini berhasil diizinkan dan disimpan. Akses tetap aktif setelah bot restart.");
});

composer.command('unauth', async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ctx.ownerId) {
        return ctx.reply("❌ Maaf, hanya Owner yang dapat menggunakan perintah ini.");
    }

    const argument = String(ctx.match || '').trim();
    let chatId = ctx.chat.id;
    if (argument) {
        if (!/^-?\d+$/.test(argument) || !Number.isSafeInteger(Number(argument)) || Number(argument) === 0) {
            return ctx.reply('❌ ID chat tidak valid. Gunakan /unauth ID_CHAT.');
        }
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Untuk mencabut akses berdasarkan ID, gunakan /unauth ID_CHAT di chat pribadi dengan bot.');
        }
        chatId = Number(argument);
    }

    if (!ctx.authorizedChats.has(chatId)) {
        return ctx.reply("⚠️ Chat ini memang belum diizinkan (unauthorized).");
    }

    ctx.authorizedChats.delete(chatId);
    contentStore.deleteAuthorizedChat(chatId);
    await ctx.reply(`❌ Izin chat <code>${chatId}</code> telah dicabut dan dihapus dari daftar.`, { parse_mode: 'HTML' });
});

module.exports = composer;
