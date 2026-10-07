const { Composer } = require('grammy');
const composer = new Composer();

composer.command('rules', async (ctx) => {
    const rulesMessage = `📜 *Peraturan Grup:*
1. Dilarang menggunakan kata-kata kasar (pesan akan dihapus otomatis).
2. Dilarang spam atau mengirim link penipuan.
3. Saling menghormati sesama anggota.
4. Gunakan bahasa yang sopan dan santun.

_Melanggar peraturan dapat menyebabkan kamu dikeluarkan dari grup._`;
    
    await ctx.reply(rulesMessage, { parse_mode: 'Markdown' });
});

module.exports = composer;
