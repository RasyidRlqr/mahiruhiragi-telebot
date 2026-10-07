require('dotenv').config();
const { Bot } = require('grammy');
const path = require('path');

const botToken = process.env.BOT_TOKEN;
const ownerId = Number(process.env.OWNER_ID);
const ownerIdIsValid = Number.isSafeInteger(ownerId) && ownerId > 0;

if (!botToken || !ownerIdIsValid) {
    console.warn('Peringatan: BOT_TOKEN atau OWNER_ID tidak ditemukan/tidak valid di file .env');
}

const bot = new Bot(botToken || 'KOSONG');
const commandsPath = path.join(__dirname, 'commands');
const state = require(path.join(commandsPath, 'state'));
const contentStore = require(path.join(commandsPath, 'contentStore'));
const authorizedChats = new Set();
const pendingOwnerActions = new Map();

bot.use(async (ctx, next) => {
    ctx.ownerId = ownerIdIsValid ? ownerId : undefined;
    ctx.authorizedChats = authorizedChats;
    await next();
});

for (const commandFile of ['menu', 'download', 'rules', 'auth', 'stats']) {
    const commandModule = require(path.join(commandsPath, commandFile));
    bot.use(commandModule.composer || commandModule);
}

const isOwnerInPrivateChat = (ctx) =>
    ownerIdIsValid && ctx.from.id === ownerId && ctx.chat.type === 'private';

const ownerMenuKeyboard = {
    inline_keyboard: [
        [{ text: '📊 Statistik Bot', callback_data: 'owner_stats' }],
        [
            { text: '✅ Izinkan Chat', callback_data: 'owner_auth' },
            { text: '🚫 Cabut Izin', callback_data: 'owner_unauth' }
        ]
    ]
};

const showOwnerMenu = async (ctx) => {
    if (!isOwnerInPrivateChat(ctx)) {
        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({ text: 'Menu ini hanya tersedia untuk owner.' });
        } else {
            await ctx.reply('❌ Menu ini hanya tersedia untuk owner melalui chat pribadi dengan bot.');
        }
        return;
    }

    if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
            '🔐 <b>Menu Owner</b>\n\nPilih statistik atau pengelolaan akses chat.',
            { parse_mode: 'HTML', reply_markup: ownerMenuKeyboard }
        );
    } else {
        await ctx.reply(
            '🔐 <b>Menu Owner</b>\n\nPilih statistik atau pengelolaan akses chat.',
            { parse_mode: 'HTML', reply_markup: ownerMenuKeyboard }
        );
    }
};

bot.command('ownermenu', showOwnerMenu);
bot.callbackQuery('owner_menu', showOwnerMenu);

bot.callbackQuery('owner_stats', async (ctx) => {
    if (!isOwnerInPrivateChat(ctx)) {
        await ctx.answerCallbackQuery({ text: 'Menu ini hanya tersedia untuk owner.' });
        return;
    }

    const uptimeSeconds = Math.floor((Date.now() - state.botStartTime) / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptime = [
        days ? `${days} hari` : '',
        hours ? `${hours} jam` : '',
        minutes ? `${minutes} menit` : '',
        `${seconds} detik`
    ].filter(Boolean).join(' ');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
        `📊 <b>Statistik Bot</b>\n\n` +
        `⏱️ Uptime: ${uptime}\n` +
        `👥 Pengguna: ${state.uniqueUsers.size}\n` +
        `🏠 Grup bergabung: ${state.groupJoins}\n` +
        `🔐 Chat diizinkan: ${authorizedChats.size}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '⬅️ Kembali ke Menu Owner', callback_data: 'owner_menu' }]]
            }
        }
    );
});

const promptForChatId = async (ctx, action) => {
    if (!isOwnerInPrivateChat(ctx)) {
        await ctx.answerCallbackQuery({ text: 'Menu ini hanya tersedia untuk owner.' });
        return;
    }

    pendingOwnerActions.set(ctx.from.id, action);
    await ctx.answerCallbackQuery();
    await ctx.reply(
        `Kirim ID chat/grup yang ingin ${action === 'auth' ? 'diizinkan' : 'dicabut izinnya'}.\n` +
        'ID grup biasanya diawali tanda minus.',
        {
            reply_markup: {
                inline_keyboard: [[{ text: 'Batal', callback_data: 'owner_cancel' }]]
            }
        }
    );
};

bot.callbackQuery('owner_auth', (ctx) => promptForChatId(ctx, 'auth'));
bot.callbackQuery('owner_unauth', (ctx) => promptForChatId(ctx, 'unauth'));
bot.callbackQuery('owner_cancel', async (ctx) => {
    if (!isOwnerInPrivateChat(ctx)) {
        await ctx.answerCallbackQuery({ text: 'Menu ini hanya tersedia untuk owner.' });
        return;
    }

    pendingOwnerActions.delete(ctx.from.id);
    await ctx.answerCallbackQuery('Dibatalkan.');
});

bot.on('message:text', async (ctx, next) => {
    const action = pendingOwnerActions.get(ctx.from.id);
    if (!action || !isOwnerInPrivateChat(ctx) || ctx.message.text.startsWith('/')) {
        return next();
    }

    const chatIdText = ctx.message.text.trim();
    if (!/^-?\d+$/.test(chatIdText) || !Number.isSafeInteger(Number(chatIdText)) || Number(chatIdText) === 0) {
        await ctx.reply('❌ ID chat tidak valid. Kirim ID berupa angka, atau tekan Batal.');
        return;
    }

    const chatId = Number(chatIdText);
    if (action === 'auth') {
        authorizedChats.add(chatId);
        await ctx.reply(`✅ Chat <code>${chatId}</code> berhasil diizinkan.`, { parse_mode: 'HTML' });
    } else {
        const removed = authorizedChats.delete(chatId);
        await ctx.reply(
            removed
                ? `🚫 Izin untuk chat <code>${chatId}</code> berhasil dicabut.`
                : `⚠️ Chat <code>${chatId}</code> tidak ditemukan dalam daftar izin.`,
            { parse_mode: 'HTML' }
        );
    }
    pendingOwnerActions.delete(ctx.from.id);
});

const pingOwner = async (botInfo) => {
    if (!ownerIdIsValid) return;

    try {
        await bot.api.sendMessage(
            ownerId,
            `🤖 Bot Mahiru Hiragi (@${botInfo.username}) sudah aktif dan siap!\n🕐 Started at: ${new Date().toLocaleString()}`
        );
        console.log(`Pinging owner (${ownerId}) - bot started successfully`);
    } catch (error) {
        console.error('Gagal mengirim pesan ke owner:', error);
    }
};

const registerCommands = async () => {
    const publicCommands = [
        { command: 'start', description: 'Mulai bot dan lihat status' },
        { command: 'menu', description: 'Tampilkan daftar fitur yang tersedia' },
        { command: 'profile', description: 'Lihat profil Telegram kamu' },
        { command: 'download', description: 'Download video (diperlukan izin)' },
        { command: 'rules', description: 'Lihat, edit, atau hapus rules grup' },
        { command: 'notes', description: 'Lihat, edit, atau hapus notes grup' },
        { command: 'cancel', description: 'Batalkan proses edit rules atau note' }
    ];

    try {
        await bot.api.setMyCommands(publicCommands);
        if (ownerIdIsValid) {
            await bot.api.setMyCommands(
                [
                    ...publicCommands,
                    { command: 'ownermenu', description: 'Buka menu khusus owner' },
                    { command: 'stats', description: 'Lihat statistik bot' },
                    { command: 'auth', description: 'Izinkan chat/grup ini' },
                    { command: 'unauth', description: 'Cabut izin chat/grup ini' }
                ],
                { scope: { type: 'chat', chat_id: ownerId } }
            );
        }
        console.log('✅ Bot commands registered successfully');
    } catch (error) {
        console.error('❌ Failed to register bot commands:', error);
    }
};

bot.on('message:new_chat_members', async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    let botJoined = false;
    for (const member of newMembers) {
        if (member.is_bot) {
            if (member.id === bot.botInfo.id) botJoined = true;
            continue;
        }
        const name = member.first_name || 'Member';
        await ctx.reply(`Halo ${name}! 👋\nSelamat datang di grup. Silakan baca peraturan grup dengan mengetik /rules ya!`);
    }

    if (botJoined) {
        const rulesNotSet = !contentStore.getRules(ctx.chat.id);
        await ctx.reply(
            '👋 Terima kasih sudah menambahkan saya ke grup!\n' +
            (rulesNotSet
                ? '📜 Rules grup belum diatur. Admin dapat mengaturnya dengan /rules edit, lalu kirim daftar rules baru.\n'
                : '📜 Untuk membaca rules grup, gunakan /rules.\n') +
            'Gunakan /menu untuk melihat perintah rules dan notes.'
        );
    }

    if (newMembers.some((member) => !member.is_bot)) {
        state.incrementGroupJoins();
    }
});

const kataKasar = ['kasar1', 'kasar2', 'kasar3'];
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.toLowerCase();
    if (!kataKasar.some((kata) => text.includes(kata.toLowerCase()))) return;

    try {
        await ctx.deleteMessage();
        const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        const warningMsg = await ctx.reply(`⚠️ ${userName}, pesanmu dihapus karena mengandung kata-kata yang tidak pantas.`);
        setTimeout(() => {
            ctx.api.deleteMessage(ctx.chat.id, warningMsg.message_id).catch(() => {});
        }, 5000);
    } catch (error) {
        console.error('Gagal menghapus pesan (mungkin bot bukan admin):', error);
    }
});

bot.catch((err) => {
    console.error(`Error saat menangani update ${err.ctx.update.update_id}:`);
    console.error(err.error);
});

if (botToken) {
    bot.start({
        onStart: async (botInfo) => {
            console.log(`Bot Mahiru Hiragi (@${botInfo.username}) berhasil dijalankan!`);
            await pingOwner(botInfo);
            await registerCommands();
        }
    });
} else {
    console.log('Bot tidak dijalankan karena BOT_TOKEN belum disetel.');
}
