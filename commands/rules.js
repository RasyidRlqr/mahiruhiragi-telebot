const { Composer } = require('grammy');
const contentStore = require('./contentStore');

const composer = new Composer();
const pendingEdits = new Map();
const maxNoteLength = 3800;
const mediaTypes = [
    ['sticker', (message) => message.sticker?.file_id],
    ['photo', (message) => message.photo?.at(-1)?.file_id],
    ['video', (message) => message.video?.file_id],
    ['animation', (message) => message.animation?.file_id],
    ['document', (message) => message.document?.file_id],
    ['audio', (message) => message.audio?.file_id],
    ['voice', (message) => message.voice?.file_id],
    ['video_note', (message) => message.video_note?.file_id]
];

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const editKey = (ctx) => `${ctx.chat.id}:${ctx.from.id}`;
const isGroup = (chat) => chat.type === 'group' || chat.type === 'supergroup';
const normalizeNoteName = (value) => value.trim().toLowerCase();
const isValidNoteName = (name) => /^[\p{L}\p{N}_-]{1,64}$/u.test(name);

const getTargetChat = async (ctx) => {
    if (isGroup(ctx.chat)) {
        ctx.noteTargetChat = ctx.chat;
        return ctx.chat;
    }
    if (ctx.chat.type !== 'private') {
        await ctx.reply('❌ Notes hanya tersedia di grup atau chat pribadi yang sudah /connect.');
        return undefined;
    }

    const chatId = contentStore.getUserConnection(ctx.from.id);
    if (!chatId) {
        await ctx.reply('Hubungkan bot ke grup dulu: jalankan /connect di grup atau /connect ID_GRUP di chat pribadi.');
        return undefined;
    }
    try {
        const chat = await ctx.api.getChat(chatId);
        ctx.noteTargetChat = chat;
        return chat;
    } catch (error) {
        console.error(`Gagal mengambil grup yang terhubung (${chatId}):`, error);
        await ctx.reply('❌ Grup yang terhubung tidak dapat diakses. Jalankan /connect lagi dari grup.');
        return undefined;
    }
};

const canEdit = async (ctx) => {
    const chat = await getTargetChat(ctx);
    if (!chat) return false;
    if (!isGroup(chat)) {
        await ctx.reply('❌ Pengelolaan notes hanya bisa digunakan untuk grup.');
        return false;
    }
    if (!ctx.authorizedChats?.has(chat.id)) {
        await ctx.reply('❌ Grup ini belum diizinkan oleh owner.');
        return false;
    }
    try {
        const member = await ctx.api.getChatMember(chat.id, ctx.from.id);
        if (member.status === 'administrator' || member.status === 'creator') return true;
        await ctx.reply('❌ Hanya admin grup yang dapat mengelola notes.');
    } catch (error) {
        console.error(`Gagal memeriksa admin grup ${chat.id}:`, error);
        await ctx.reply('❌ Bot tidak dapat memeriksa admin grup.');
    }
    return false;
};

const isAdmin = async (ctx) => {
    const chat = ctx.noteTargetChat || ctx.chat;
    if (!isGroup(chat)) return false;
    try {
        const member = await ctx.api.getChatMember(chat.id, ctx.from.id);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        console.error(`Gagal memeriksa admin grup ${chat.id}:`, error);
        return false;
    }
};

const getMedia = (message) => {
    for (const [type, getFileId] of mediaTypes) {
        const fileId = getFileId(message);
        if (fileId) return { type, fileId };
    }
    return undefined;
};

const parseOptions = (text) => ({
    content: text.replace(/\{(?:admin|private|preview)\}/gi, '').trim(),
    options: {
        admin: /\{admin\}/i.test(text),
        private: /\{private\}/i.test(text),
        preview: /\{preview\}/i.test(text)
    }
});

const parseButtons = (text) => {
    const buttons = [];
    const content = text.replace(/\[([^\]]+)\]\(buttonurl:\/\/(https?:\/\/[^\s)]+)\)/gi, (_match, label, value) => {
        const sameRow = value.endsWith(':same');
        const url = sameRow ? value.slice(0, -5) : value;
        if (!/^https?:\/\/[^\s]+$/i.test(url)) return label;
        const button = { text: label, url };
        if (sameRow && buttons.length) buttons[buttons.length - 1].push(button);
        else buttons.push([button]);
        return '';
    }).replace(/[ \t]{2,}/g, ' ').trim();
    return { content, buttons };
};

const renderText = (text, ctx) => {
    const parsed = parseButtons(text);
    const first = escapeHtml(ctx.from.first_name || '');
    const mention = ctx.from.username
        ? `@${escapeHtml(ctx.from.username)}`
        : `<a href="tg://user?id=${ctx.from.id}">${first}</a>`;
    const values = {
        '{first}': first,
        '{mention}': mention,
        '{chatname}': escapeHtml(ctx.noteTargetChat?.title || ctx.chat.title || ctx.chat.first_name || 'chat')
    };
    const content = escapeHtml(parsed.content)
        .replace(/\{first\}|\{mention\}|\{chatname\}/gi, (tag) => values[tag.toLowerCase()]);
    return { content, buttons: parsed.buttons };
};

const sendNote = async (ctx, note, destination = ctx.chat.id) => {
    if (note.options.admin && !(await isAdmin(ctx))) {
        await ctx.reply('❌ Note ini hanya bisa dipanggil admin grup.');
        return;
    }

    const text = renderText(note.content || '', ctx);
    const caption = renderText(note.caption || '', ctx);
    const buttons = text.buttons.concat(caption.buttons);
    const markup = buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {};
    const body = text.content || caption.content;
    if (!note.mediaType || !note.mediaFileId) {
        if (!body && !buttons.length) {
            await ctx.reply('ℹ️ Note ini tidak memiliki isi.');
            return;
        }
        await ctx.api.sendMessage(destination, body || '\u00a0', {
            parse_mode: 'HTML',
            disable_web_page_preview: !note.options.preview,
            ...markup
        });
        return;
    }

    const methods = {
        sticker: 'sendSticker',
        photo: 'sendPhoto',
        video: 'sendVideo',
        animation: 'sendAnimation',
        document: 'sendDocument',
        audio: 'sendAudio',
        voice: 'sendVoice',
        video_note: 'sendVideoNote'
    };
    const method = methods[note.mediaType];
    if (!method || typeof ctx.api[method] !== 'function') {
        throw new Error(`Jenis media note tidak didukung: ${note.mediaType}`);
    }

    const mediaOptions = { ...markup };
    if (body && note.mediaType !== 'sticker' && note.mediaType !== 'video_note') {
        mediaOptions.caption = body;
        mediaOptions.parse_mode = 'HTML';
    }
    await ctx.api[method](destination, note.mediaFileId, mediaOptions);
    if (body && (note.mediaType === 'sticker' || note.mediaType === 'video_note')) {
        await ctx.api.sendMessage(destination, body, { parse_mode: 'HTML', ...markup });
    }
};

const deliverNote = async (ctx, name) => {
    const chat = await getTargetChat(ctx);
    if (!chat) return;
    const note = contentStore.getNote(chat.id, name);
    if (!note) {
        await ctx.reply(`❌ Note <code>${escapeHtml(name)}</code> tidak ditemukan. Ketik /notes untuk melihat daftar.`, {
            parse_mode: 'HTML'
        });
        return;
    }

    if (contentStore.getPrivateNotes(chat.id) || note.options.private) {
        try {
            await sendNote(ctx, note, ctx.from.id);
        } catch (error) {
            console.error(`Gagal mengirim note "${name}" ke PM user ${ctx.from.id}:`, error);
            await ctx.reply('❌ Tidak bisa mengirim PM. Buka chat bot dan kirim /start, lalu coba lagi.');
        }
        return;
    }
    await sendNote(ctx, note);
};

const validNameOrReply = async (ctx, name) => {
    if (isValidNoteName(name)) return true;
    await ctx.reply('Nama note hanya boleh memakai huruf, angka, _ atau - (maksimal 64 karakter).');
    return false;
};

const saveNote = async (ctx, name, text, repliedMessage) => {
    if (!(await canEdit(ctx))) return;
    const chat = ctx.noteTargetChat;
    const parsed = parseOptions(text);
    const parsedCaption = parseOptions(repliedMessage?.caption || '');
    const media = repliedMessage ? getMedia(repliedMessage) : undefined;
    if (escapeHtml(parsed.content).length > maxNoteLength) {
        await ctx.reply(`❌ Isi note maksimal ${maxNoteLength} karakter.`);
        return;
    }
    if (!parsed.content && !media && !repliedMessage?.text && !repliedMessage?.caption) {
        await ctx.reply('❌ Isi note kosong. Untuk media, balas media dengan /save nama.');
        return;
    }

    contentStore.saveNote(chat.id, name, {
        content: parsed.content || repliedMessage?.text || '',
        mediaType: media?.type,
        mediaFileId: media?.fileId,
        caption: parsedCaption.content,
        options: {
            admin: parsed.options.admin || parsedCaption.options.admin,
            private: parsed.options.private || parsedCaption.options.private,
            preview: parsed.options.preview || parsedCaption.options.preview
        }
    });
    pendingEdits.delete(editKey(ctx));
    await ctx.reply(`✅ Note <code>${escapeHtml(name)}</code> tersimpan.`, { parse_mode: 'HTML' });
};

const getNote = async (ctx, rawName) => {
    const name = normalizeNoteName(rawName.replace(/^#/, ''));
    if (!(await validNameOrReply(ctx, name))) return;
    await deliverNote(ctx, name);
};

composer.command('connect', async (ctx) => {
    let chat;
    if (isGroup(ctx.chat)) {
        chat = ctx.chat;
    } else if (ctx.chat.type === 'private') {
        const chatIdText = String(ctx.match || '').trim();
        if (!/^-?\d+$/.test(chatIdText) || !Number.isSafeInteger(Number(chatIdText))) {
            return ctx.reply('Gunakan /connect ID_GRUP di PM, atau jalankan /connect langsung di grup.');
        }
        try {
            chat = await ctx.api.getChat(Number(chatIdText));
        } catch (error) {
            console.error(`Gagal mengambil grup ${chatIdText} saat connect:`, error);
            return ctx.reply('❌ Grup tidak ditemukan atau bot tidak bisa mengaksesnya.');
        }
    } else {
        return ctx.reply('❌ Connect hanya tersedia di grup atau PM bot.');
    }

    if (!isGroup(chat)) return ctx.reply('❌ ID tersebut bukan grup/supergroup.');
    if (!ctx.authorizedChats?.has(chat.id)) return ctx.reply('❌ Grup ini belum diizinkan oleh owner.');
    try {
        const member = await ctx.api.getChatMember(chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply('❌ Hanya admin grup yang dapat menghubungkan grup.');
        }
    } catch (error) {
        console.error(`Gagal memeriksa admin grup ${chat.id} untuk connect:`, error);
        return ctx.reply('❌ Bot tidak dapat memeriksa admin grup.');
    }

    contentStore.setUserConnection(ctx.from.id, chat.id);
    await ctx.reply(`✅ Terhubung ke <b>${escapeHtml(chat.title || String(chat.id))}</b> (<code>${chat.id}</code>).`, {
        parse_mode: 'HTML'
    });
});

composer.command('disconnect', async (ctx) => {
    if (!contentStore.deleteUserConnection(ctx.from.id)) {
        await ctx.reply('ℹ️ Tidak ada grup yang terhubung.');
        return;
    }
    await ctx.reply('✅ Koneksi grup diputus.');
});

composer.command('rules', async (ctx) => {
    const argument = String(ctx.match || '').trim();
    const edit = argument.match(/^edit(?:\s+([\s\S]+))?$/i);
    if (edit) {
        if (!(await canEdit(ctx))) return;
        const chatId = ctx.noteTargetChat.id;
        if (edit[1]) {
            const rules = edit[1].trim();
            if (!rules) return ctx.reply('Isi rules tidak boleh kosong.');
            if (escapeHtml(rules).length > maxNoteLength) return ctx.reply(`Rules maksimal ${maxNoteLength} karakter.`);
            contentStore.saveRules(chatId, rules);
            await ctx.reply('✅ Rules grup berhasil diperbarui.');
        } else {
            pendingEdits.set(editKey(ctx), { type: 'rules' });
            await ctx.reply('Kirim rules baru dalam satu pesan. Ketik /cancel untuk batal.');
        }
        return;
    }
    if (argument.toLowerCase() === 'delete') {
        if (!(await canEdit(ctx))) return;
        contentStore.deleteRules(ctx.noteTargetChat.id);
        await ctx.reply('✅ Rules grup dihapus.');
        return;
    }
    const chat = await getTargetChat(ctx);
    if (!chat) return;

    const rules = contentStore.getRules(chat.id);
    await ctx.reply(rules
        ? `<b>📜 Peraturan Grup</b>\n\n${escapeHtml(rules)}`
        : '📜 Rules grup belum diatur. Admin dapat menggunakan /rules edit.', { parse_mode: 'HTML' });
});

composer.command('notes', async (ctx) => {
    const argument = String(ctx.match || '').trim();
    const edit = argument.match(/^edit(?:\s+([\s\S]+))?$/i);
    if (edit) {
        const name = normalizeNoteName(edit[1] || 'main');
        if (!(await validNameOrReply(ctx, name))) return;
        if (!(await canEdit(ctx))) return;
        pendingEdits.set(editKey(ctx), { type: 'note', name });
        await ctx.reply('Kirim teks/media untuk disimpan sebagai note. Atau gunakan /save nama isi. Ketik /cancel untuk batal.');
        return;
    }

    const chat = await getTargetChat(ctx);
    if (!chat) return;
    const names = contentStore.getNotes(chat.id);
    await ctx.reply(
        names.length
            ? `<b>📝 Notes grup</b>\n\n${names.map((name) => `• <code>${escapeHtml(name)}</code>`).join('\n')}\n\nPanggil dengan /get nama atau #nama.`
            : '📝 Belum ada notes. Admin dapat membuatnya dengan /save nama isi.',
        { parse_mode: 'HTML' }
    );
});

composer.command('get', async (ctx) => {
    const name = String(ctx.match || '').trim();
    if (!name) return ctx.reply('Gunakan /get nama.');
    await getNote(ctx, name);
});

composer.command('save', async (ctx) => {
    const match = String(ctx.match || '').trim().match(/^([^\s]+)(?:\s+([\s\S]*))?$/);
    if (!match) return ctx.reply('Gunakan /save nama isi atau balas media dengan /save nama.');
    const name = normalizeNoteName(match[1]);
    if (!(await validNameOrReply(ctx, name))) return;
    await saveNote(ctx, name, match[2] || '', ctx.message.reply_to_message);
});

composer.command('clear', async (ctx) => {
    const name = normalizeNoteName(String(ctx.match || '').trim());
    if (!(await validNameOrReply(ctx, name))) return;
    if (!(await canEdit(ctx))) return;
    const removed = contentStore.deleteNote(ctx.noteTargetChat.id, name);
    await ctx.reply(removed ? `✅ Note "${escapeHtml(name)}" dihapus.` : `ℹ️ Note "${escapeHtml(name)}" tidak ditemukan.`);
});

composer.command('clearall', async (ctx) => {
    if (!(await canEdit(ctx))) return;
    const count = contentStore.deleteAllNotes(ctx.noteTargetChat.id);
    await ctx.reply(`✅ ${count} note berhasil dihapus.`);
});

composer.command('privatenotes', async (ctx) => {
    const value = String(ctx.match || '').trim().toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply('Gunakan /privatenotes on atau /privatenotes off.');
    if (!(await canEdit(ctx))) return;
    contentStore.setPrivateNotes(ctx.noteTargetChat.id, value === 'on');
    await ctx.reply(`✅ Private notes ${value === 'on' ? 'aktif' : 'nonaktif'}.`);
});

composer.command('cancel', async (ctx, next) => {
    if (!pendingEdits.delete(editKey(ctx))) return next();
    await ctx.reply('Pengeditan dibatalkan.');
});

composer.on('message:text', async (ctx, next) => {
    const key = editKey(ctx);
    const pending = pendingEdits.get(key);
    if (pending && !ctx.message.text.startsWith('/')) {
        if (!(await canEdit(ctx))) {
            pendingEdits.delete(key);
            return;
        }
        if (pending.type === 'rules') {
            const rules = ctx.message.text.trim();
            if (!rules || escapeHtml(rules).length > maxNoteLength) {
                await ctx.reply(`Rules tidak boleh kosong dan maksimal ${maxNoteLength} karakter.`);
                return;
            }
            contentStore.saveRules(ctx.noteTargetChat.id, rules);
            pendingEdits.delete(key);
            await ctx.reply('✅ Rules grup berhasil diperbarui.');
        } else {
            await saveNote(ctx, pending.name, ctx.message.text, undefined);
            pendingEdits.delete(key);
        }
        return;
    }
    const match = ctx.message.text.match(/^\s*#([\p{L}\p{N}_-]{1,64})(?:@([A-Za-z0-9_]+))?\s*[.!?,;:]*\s*$/u);
    if (!match) return next();
    if (match[2] && match[2].toLowerCase() !== ctx.me.username?.toLowerCase()) return next();
    await getNote(ctx, match[1]);
});

composer.on('message', async (ctx, next) => {
    const key = editKey(ctx);
    const pending = pendingEdits.get(key);
    if (pending?.type === 'note' && !ctx.message.text?.startsWith('/')) {
        if (!(await canEdit(ctx))) {
            pendingEdits.delete(key);
            return;
        }
        const media = getMedia(ctx.message);
        if (!media) return next();
        await saveNote(ctx, pending.name, '', ctx.message);
        pendingEdits.delete(key);
        return;
    }

    if (!ctx.message.reply_to_message) return next();
    const match = ctx.message.text?.match(/^\/save(?:@\w+)?\s+([^\s]+)\s*$/i);
    if (!match) return next();
    const name = normalizeNoteName(match[1]);
    if (!(await validNameOrReply(ctx, name))) return;
    await saveNote(ctx, name, '', ctx.message.reply_to_message);
});

module.exports = composer;
