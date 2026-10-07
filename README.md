# mahiruhiragi-telebot
bot telegram 

## Rules dan notes grup

Pada grup yang sudah diizinkan oleh owner, admin grup dapat mengelola konten:

- `/rules` menampilkan rules grup. Admin bisa memakai `/rules edit isi rules` untuk menyimpan langsung atau `/rules edit` lalu mengirim rules baru.
- `/rules delete` menghapus rules yang sudah disimpan. Jika rules belum diatur, `/rules` menampilkan petunjuk untuk mengaturnya.
- `/notes` menampilkan semua nama note. Gunakan `/get nama_note` atau `#nama_note` untuk memanggil note.
- Admin dapat membuat/mengganti note dengan `/save nama_note isi`. Untuk media, balas foto/stiker/video/file dengan `/save nama_note`.
- Admin dapat menghapus note dengan `/clear nama_note` atau semua note dengan `/clearall`.
- `/privatenotes on` mengirim note ke PM pemanggil, sedangkan `/privatenotes off` mengirimnya di grup. Pemanggil harus pernah membuka PM bot dengan `/start`.
- Admin dapat menjalankan `/connect` di grup untuk menghubungkan PM-nya, lalu memakai `/connect ID_GRUP` di PM. Setelah terhubung, perintah `/notes`, `/get`, `/save`, `/clear`, dan `/privatenotes` di PM akan bekerja untuk grup tersebut. `/disconnect` memutus koneksi.
- Isi note mendukung `{first}`, `{mention}`, `{chatname}`, `{admin}`, `{private}`, `{preview}`, serta tombol URL `[Nama](buttonurl://https://example.com)`.
- Pintasan `#nama_note` menerima `#nama_note`, `#nama_note@username_bot`, dan tanda baca setelah nama. Telegram hanya mengirim hashtag biasa ke bot jika **Group Privacy** dimatikan melalui BotFather atau bot menjadi admin grup. Sesudah mengubah privacy di BotFather, keluarkan bot lalu tambahkan kembali ke grup. Jika tidak ingin mengubah privacy/admin, gunakan `/get nama_note`, yang selalu diteruskan Telegram sebagai perintah.
- `/cancel` membatalkan pengeditan yang sedang berlangsung.

Rules dan notes disimpan per grup dalam database SQLite lokal di `data/bot.sqlite`. Pastikan bot dapat memeriksa anggota grup agar status admin dapat diverifikasi.

Statistik menyimpan ID unik pengguna dan grup yang pernah berinteraksi dengan bot di SQLite yang sama. Pengguna dihitung saat mengirim update ke bot, dan grup dihitung saat bot menerima update di grup tersebut; aktivitas grup yang tidak dikirim Telegram ke bot (misalnya pesan biasa saat bot tidak menerima pesan karena privacy mode) tidak dapat dihitung. Data sebelum statistik persisten ditambahkan tidak dapat dipulihkan.

## Akses grup

Daftar grup yang diizinkan juga disimpan di SQLite lokal dan tetap aktif setelah bot restart. Owner dapat:

- Menjalankan `/auth` di grup untuk mengizinkannya.
- Menjalankan `/auth list` di chat pribadi dengan bot untuk melihat nama dan ID grup yang diizinkan.
- Menjalankan `/unauth ID_CHAT` di chat pribadi untuk mencabut akses, atau `/unauth` di grup yang ingin dicabut.

Grup yang diizinkan sebelum penyimpanan permanen ini ditambahkan perlu diizinkan sekali lagi setelah bot diperbarui.
