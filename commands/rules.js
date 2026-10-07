const { Composer } = require('grammy');
const contentStore = require('./contentStore');
const composer = new Composer();
const pendingEdits = new Map();
const maxRenderedContentLength = 3800;

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const editKey = (ctx) => `${ctx.chat.id}:${ctx.from.id}`;
const isGroup = (chat) => chat.type === 'group' || chat.type === 'supergroup';

const canEdit = async (ctx) => {
    if (!isGroup(ctx.chat)) {
        await ctx.reply('❌ Rules dan notes hanya bisa diedit dari grup.');
        return false;
    }

    if (!ctx.authorizedChats || !ctx.authorizedChats.has(ctx.chat.id)) {
        await ctx.reply('❌ Grup ini belum diizinkan oleh owner untuk mengedit rules dan notes.');
        return false;
    }

    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
            await ctx.reply('❌ Hanya admin grup yang dapat mengedit rules dan notes.');
            return false;
        }
    } catch (error) {
        console.error(`Gagal memeriksa admin grup ${ctx.chat.id}:`, error);
        await ctx.reply('❌ Bot tidak dapat memeriksa admin grup. Pastikan bot memiliki akses yang diperlukan.');
        return false;
    }

    return true;
};

const promptForEdit = async (ctx, edit) => {
    if (!(await canEdit(ctx))) return;

    pendingEdits.set(editKey(ctx), edit);
    if (edit.type === 'rules') {
        await ctx.reply(
            'Kirim daftar rules baru dalam satu pesan, satu aturan per baris. ' +
            'Contoh:\n1. Dilarang spam.\n2. Hormati sesama anggota.\n\n' +
            'Rules lama akan diganti. Ketik /cancel untuk membatalkan.'
        );
    } else {
        await ctx.reply(
            `Kirim isi baru untuk note "${escapeHtml(edit.name)}". Note yang lama akan diganti. Ketik /cancel untuk membatalkan.`,
            { parse_mode: 'HTML' }
        );
    }
};

const normalizeNoteName = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const isValidNoteName = (name) => name.length > 0 && [...name].length <= 64 && !/[\r\n]/.test(name);

composer.command('rules', async (ctx) => {
    const argument = String(ctx.match || '').trim();
    const action = argument.toLowerCase();
    if (action === 'edit') {
        await promptForEdit(ctx, { type: 'rules' });
        return;
    }

    if (action === 'delete') {
        if (!(await canEdit(ctx))) return;
        pendingEdits.delete(editKey(ctx));
        if (!contentStore.deleteRules(ctx.chat.id)) {
            await ctx.reply('ℹ️ Rules grup memang belum diatur.');
            return;
        }
        await ctx.reply('✅ Rules grup sudah dihapus. /rules sekarang akan memberi tahu bahwa rules belum diatur.');
        return;
    }

    if (argument) {
        await ctx.reply('Gunakan /rules untuk melihat, /rules edit untuk mengubah, atau /rules delete untuk menghapus rules.');
        return;
    }

    const rules = contentStore.getRules(ctx.chat.id);
    if (!rules) {
        await ctx.reply('📜 Rules grup belum diatur. Admin dapat mengaturnya dengan /rules edit, lalu kirim daftar rules baru.');
        return;
    }

    await ctx.reply(`<b>📜 Peraturan Grup</b>\n\n${escapeHtml(rules)}`, { parse_mode: 'HTML' });
});

composer.command('notes', async (ctx) => {
    const argument = String(ctx.match || '').trim();
    const editMatch = argument.match(/^edit(?:\s+([\s\S]+))?$/i);
    const deleteMatch = argument.match(/^delete(?:\s+([\s\S]+))?$/i);

    if (editMatch) {
        const name = normalizeNoteName(editMatch[1] || '');
        if (!isValidNoteName(name)) {
            await ctx.reply('Gunakan /notes edit <nama_note>. Contoh: /notes edit kontak admin');
            return;
        }

        await promptForEdit(ctx, { type: 'note', name });
        return;
    }

    if (deleteMatch) {
        const name = normalizeNoteName(deleteMatch[1] || '');
        if (!isValidNoteName(name)) {
            await ctx.reply('Gunakan /notes delete nama_note. Contoh: /notes delete kontak admin');
            return;
        }
        if (!(await canEdit(ctx))) return;

        const deleted = contentStore.deleteNote(ctx.chat.id, name);
        await ctx.reply(
            deleted
                ? `✅ Note "${escapeHtml(name)}" berhasil dihapus.`
                : `ℹ️ Note "${escapeHtml(name)}" tidak ditemukan.`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    if (!argument) {
        await ctx.reply(
            'Gunakan /notes nama_note untuk melihat note, /notes edit nama_note untuk membuat/mengubah, ' +
            'atau /notes delete nama_note untuk menghapus.\n' +
            'Contoh: /notes edit kontak admin'
        );
        return;
    }

    const name = normalizeNoteName(argument);
    if (!isValidNoteName(name)) {
        await ctx.reply('Nama note tidak valid. Gunakan nama maksimal 64 karakter dalam satu baris.');
        return;
    }

    const note = contentStore.getNote(ctx.chat.id, name);
    if (!note) {
        await ctx.reply(`Note "${escapeHtml(name)}" belum tersedia. Admin dapat membuatnya dengan /notes edit ${name}.`, {
            parse_mode: 'HTML'
        });
        return;
    }

    await ctx.reply(`<b>📝 ${escapeHtml(name)}</b>\n\n${escapeHtml(note)}`, { parse_mode: 'HTML' });
});

composer.command('cancel', async (ctx, next) => {
    if (!pendingEdits.delete(editKey(ctx))) return next();
    await ctx.reply('Pengeditan dibatalkan.');
});

composer.on('message:text', async (ctx, next) => {
    const key = editKey(ctx);
    const edit = pendingEdits.get(key);
    if (!edit || ctx.message.text.startsWith('/')) return next();

    if (!(await canEdit(ctx))) {
        pendingEdits.delete(key);
        return;
    }

    const content = ctx.message.text.trim();
    if (!content) {
        await ctx.reply('Konten tidak boleh kosong. Kirim teks atau ketik /cancel untuk membatalkan.');
        return;
    }

    if (escapeHtml(content).length > maxRenderedContentLength) {
        await ctx.reply('Konten terlalu panjang. Mohon batasi agar tidak melebihi 3800 karakter setelah diproses.');
        return;
    }

    if (edit.type === 'rules') {
        contentStore.saveRules(ctx.chat.id, content);
        pendingEdits.delete(key);
        await ctx.reply('✅ Rules grup berhasil diperbarui.');
    } else {
        contentStore.saveNote(ctx.chat.id, edit.name, content);
        pendingEdits.delete(key);
        await ctx.reply(`✅ Note "${escapeHtml(edit.name)}" berhasil disimpan.`, { parse_mode: 'HTML' });
    }
});

module.exports = composer;
