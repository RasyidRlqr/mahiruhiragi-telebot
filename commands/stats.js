const { Composer } = require('grammy');
const composer = new Composer();

// Command untuk menampilkan statistik bot (hanya untuk owner)
composer.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    
    // Cek apakah yang memanggil adalah Owner
    if (userId !== ctx.ownerId) {
        return ctx.reply("❌ Maaf, hanya Owner yang dapat menggunakan perintah ini.");
    }
    
    // Import shared state
    const state = require('./state');
    
    // Hitung uptime menggunakan botStartTime dari state
    const uptimeMs = Date.now() - state.botStartTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);
    
    let uptimeString = '';
    if (uptimeDays > 0) uptimeString += `${uptimeDays} hari `;
    if (uptimeHours > 0) uptimeString += `${uptimeHours % 24} jam `;
    if (uptimeMinutes > 0) uptimeString += `${uptimeMinutes % 60} menit `;
    uptimeString += `${uptimeSeconds % 60} detik`;
    
    // Get system information
    let systemInfo = 'Tidak dapat mendeteksi info sistem';
    try {
        const os = require('os');
        const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // GB
        const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024)); // GB
        
        const cpus = os.cpus();
        const cpuModel = cpus[0] ? cpus[0].model : 'Unknown';
        const cpuCores = cpus.length;
        
        const diskUsage = await getDiskUsage();
        
        systemInfo = `🖥️ **Sistem Info:**\n`;
        systemInfo += `• CPU: ${cpuModel} (${cpuCores} cores)\n`;
        systemInfo += `• RAM: ${totalMem}GB total, ${freeMem}GB bebas\n`;
        systemInfo += `• Storage: ${diskUsage.total} total, ${diskUsage.free} bebas\n`;
    } catch (error) {
        console.error('Gagal mendapatkan info sistem:', error);
    }
    
    // Buat pesan statistik
    let statsMessage = `📊 *Statistik Bot Mahiru Hiragi* 📊\n\n`;
    statsMessage += `⏱️ **Uptime:** ${uptimeString}\n`;
    statsMessage += `👥 **Pengguna Online:** ${state.uniqueUsers.size}\n`;
    statsMessage += `🏠 **Grup Join:** ${state.groupJoins}\n\n`;
    statsMessage += `${systemInfo}\n`;
    statsMessage += `📅 **Terakhir diperbarui:** ${new Date().toLocaleString()}`;
    
    await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
});

// Helper function untuk mendapatkan info disk usage
function getDiskUsage() {
    return new Promise((resolve) => {
        const fs = require('fs');
        const path = require('path');
        
        try {
            const diskPath = path.resolve('.');
            fs.stat(diskPath, (err) => {
                if (err) {
                    resolve({ total: 'N/A', free: 'N/A' });
                    return;
                }
                
                // Untuk simulasi, kita bisa menggunakan fs.statfs di Node.js
                // atau mencoba mendapatkan info dari process
                resolve({ 
                    total: 'Tersedia', 
                    free: 'Tersedia' 
                });
            });
        } catch (error) {
            resolve({ total: 'N/A', free: 'N/A' });
        }
    });
}

module.exports = { composer };