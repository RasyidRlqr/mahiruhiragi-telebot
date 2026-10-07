# mahiruhiragi-telebot
bot telegram 

## Rules dan notes grup

Pada grup yang sudah diizinkan oleh owner, admin grup dapat mengelola konten:

- `/rules` menampilkan rules grup. `/rules edit` memulai penggantian rules; kirim rules baru sebagai pesan berikutnya.
- `/rules delete` menghapus rules yang sudah disimpan. Jika rules belum diatur, `/rules` menampilkan petunjuk untuk mengaturnya.
- `/notes nama_note` menampilkan note. `/notes edit nama_note` membuat atau mengganti note; kirim isinya sebagai pesan berikutnya.
- `/notes delete nama_note` menghapus note yang dipilih.
- `/cancel` membatalkan pengeditan yang sedang berlangsung.

Rules dan notes disimpan per grup dalam database SQLite lokal di `data/bot.sqlite`. Pastikan bot dapat memeriksa anggota grup agar status admin dapat diverifikasi.
