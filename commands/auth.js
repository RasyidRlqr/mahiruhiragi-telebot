const { Composer } = require('grammy');
const composer = new Composer();

// Command untuk mengizinkan chat/grup ini menggunakan fitur berizin.
// Hanya Owner yang bisa menjalankan command ini.
composer.command('auth', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Cek apakah yang memanggil adalah Owner
    if (userId !== ctx.ownerId) {
        return ctx.reply("❌ Maaf, hanya Owner yang dapat menggunakan perintah ini.");
    }

    // Tambahkan chat_id saat ini ke daftar auth
    if (ctx.authorizedChats.has(chatId)) {
        return ctx.reply("✅ Chat ini sudah diizinkan (authorized) sebelumnya.");
    }

    ctx.authorizedChats.add(chatId);
    await ctx.reply("✅ Chat/Grup ini berhasil diizinkan (authorized) oleh Owner. Fitur berizin sekarang dapat digunakan di sini.");
});

// Command untuk mencabut izin (opsional)
composer.command('unauth', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    if (userId !== ctx.ownerId) {
        return ctx.reply("❌ Maaf, hanya Owner yang dapat menggunakan perintah ini.");
    }

    if (!ctx.authorizedChats.has(chatId)) {
        return ctx.reply("⚠️ Chat ini memang belum diizinkan (unauthorized).");
    }

    // Jangan izinkan owner untuk mencabut izin dirinya sendiri di private chat dengan bot
    if (chatId === ctx.ownerId) {
        return ctx.reply("❌ Kamu tidak bisa mencabut izin dirimu sendiri.");
    }

    ctx.authorizedChats.delete(chatId);
    await ctx.reply("❌ Izin chat/grup ini telah dicabut.");
});

module.exports = composer;
