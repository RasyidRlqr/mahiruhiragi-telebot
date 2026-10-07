const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDirectory = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, 'bot.sqlite'));
database.exec(`
    CREATE TABLE IF NOT EXISTS chat_rules (
        chat_id INTEGER PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_notes (
        chat_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        sticker_file_id TEXT,
        media_type TEXT,
        media_file_id TEXT,
        caption TEXT,
        note_options TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_id, name)
    );
    CREATE TABLE IF NOT EXISTS chat_note_settings (
        chat_id INTEGER PRIMARY KEY,
        private_mode INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_chat_connections (
        user_id INTEGER PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS authorized_chats (
        chat_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        chat_type TEXT NOT NULL,
        authorized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracked_users (
        user_id INTEGER PRIMARY KEY,
        first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracked_groups (
        chat_id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

const noteColumns = database.prepare('PRAGMA table_info(chat_notes)').all();
const noteColumnNames = new Set(noteColumns.map((column) => column.name));
if (!noteColumnNames.has('sticker_file_id')) database.exec('ALTER TABLE chat_notes ADD COLUMN sticker_file_id TEXT');
if (!noteColumnNames.has('media_type')) database.exec('ALTER TABLE chat_notes ADD COLUMN media_type TEXT');
if (!noteColumnNames.has('media_file_id')) database.exec('ALTER TABLE chat_notes ADD COLUMN media_file_id TEXT');
if (!noteColumnNames.has('caption')) database.exec('ALTER TABLE chat_notes ADD COLUMN caption TEXT');
if (!noteColumnNames.has('note_options')) database.exec("ALTER TABLE chat_notes ADD COLUMN note_options TEXT NOT NULL DEFAULT '{}'");

database.exec(`
    UPDATE chat_notes
    SET media_type = 'sticker', media_file_id = sticker_file_id
    WHERE sticker_file_id IS NOT NULL AND media_file_id IS NULL
`);

const getNoteStatement = database.prepare(`
    SELECT name, content, media_type AS mediaType, media_file_id AS mediaFileId,
           caption, note_options AS optionsJson
    FROM chat_notes WHERE chat_id = ? AND name = ?
`);
const getNotesStatement = database.prepare(
    'SELECT name FROM chat_notes WHERE chat_id = ? ORDER BY name COLLATE NOCASE'
);
const deleteNoteStatement = database.prepare(
    'DELETE FROM chat_notes WHERE chat_id = ? AND name = ?'
);
const deleteAllNotesStatement = database.prepare('DELETE FROM chat_notes WHERE chat_id = ?');
const saveNoteStatement = database.prepare(`
    INSERT INTO chat_notes (chat_id, name, content, sticker_file_id, media_type, media_file_id, caption, note_options)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, name) DO UPDATE SET
        content = excluded.content,
        sticker_file_id = excluded.sticker_file_id,
        media_type = excluded.media_type,
        media_file_id = excluded.media_file_id,
        caption = excluded.caption,
        note_options = excluded.note_options,
        updated_at = CURRENT_TIMESTAMP
`);
const getPrivateNotesStatement = database.prepare(
    'SELECT private_mode FROM chat_note_settings WHERE chat_id = ?'
);
const setPrivateNotesStatement = database.prepare(`
    INSERT INTO chat_note_settings (chat_id, private_mode) VALUES (?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET private_mode = excluded.private_mode
`);
const getUserConnectionStatement = database.prepare(
    'SELECT chat_id FROM user_chat_connections WHERE user_id = ?'
);
const setUserConnectionStatement = database.prepare(`
    INSERT INTO user_chat_connections (user_id, chat_id) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, connected_at = CURRENT_TIMESTAMP
`);
const deleteUserConnectionStatement = database.prepare(
    'DELETE FROM user_chat_connections WHERE user_id = ?'
);

const getAuthorizedChatsStatement = database.prepare(
    'SELECT chat_id AS chatId, title, chat_type AS chatType FROM authorized_chats ORDER BY title COLLATE NOCASE'
);
const saveAuthorizedChatStatement = database.prepare(`
    INSERT INTO authorized_chats (chat_id, title, chat_type)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
        title = excluded.title,
        chat_type = excluded.chat_type
`);
const deleteAuthorizedChatStatement = database.prepare(
    'DELETE FROM authorized_chats WHERE chat_id = ?'
);
const getTrackedUserIdsStatement = database.prepare('SELECT user_id FROM tracked_users');
const getTrackedGroupIdsStatement = database.prepare('SELECT chat_id FROM tracked_groups');
const addTrackedUserStatement = database.prepare('INSERT OR IGNORE INTO tracked_users (user_id) VALUES (?)');
const addTrackedGroupStatement = database.prepare(`
    INSERT INTO tracked_groups (chat_id, title)
    VALUES (?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET title = excluded.title
    WHERE title != excluded.title
`);

const parseNote = (row) => {
    if (!row) return undefined;
    let options;
    try {
        options = JSON.parse(row.optionsJson);
    } catch (error) {
        console.error(`Invalid options saved for note "${row.name}":`, error);
        options = {};
    }
    return { ...row, options };
};

const saveNoteTransaction = database.transaction((chatId, name, note) => {
    const stickerFileId = note.mediaType === 'sticker' ? note.mediaFileId : null;
    saveNoteStatement.run(
        chatId,
        name,
        note.content || '',
        stickerFileId,
        note.mediaType || null,
        note.mediaFileId || null,
        note.caption || null,
        JSON.stringify(note.options || {})
    );
});

module.exports = {
    getRules(chatId) {
        return getRulesStatement.get(chatId)?.content;
    },
    saveRules(chatId, content) {
        saveRulesStatement.run(chatId, content);
    },
    deleteRules(chatId) {
        return deleteRulesStatement.run(chatId).changes > 0;
    },
    getNote(chatId, name) {
        return parseNote(getNoteStatement.get(chatId, name));
    },
    getNotes(chatId) {
        return getNotesStatement.all(chatId).map((row) => row.name);
    },
    saveNote(chatId, name, note) {
        saveNoteTransaction(chatId, name, note);
    },
    deleteNote(chatId, name) {
        return deleteNoteStatement.run(chatId, name).changes > 0;
    },
    deleteAllNotes(chatId) {
        return deleteAllNotesStatement.run(chatId).changes;
    },
    getPrivateNotes(chatId) {
        return Boolean(getPrivateNotesStatement.get(chatId)?.private_mode);
    },
    setPrivateNotes(chatId, enabled) {
        setPrivateNotesStatement.run(chatId, enabled ? 1 : 0);
    },
    getUserConnection(userId) {
        return getUserConnectionStatement.get(userId)?.chat_id;
    },
    setUserConnection(userId, chatId) {
        setUserConnectionStatement.run(userId, chatId);
    },
    deleteUserConnection(userId) {
        return deleteUserConnectionStatement.run(userId).changes > 0;
    },
    getAuthorizedChats() {
        return getAuthorizedChatsStatement.all();
    },
    saveAuthorizedChat(chatId, title = String(chatId), chatType = 'unknown') {
        saveAuthorizedChatStatement.run(chatId, title || String(chatId), chatType);
    },
    deleteAuthorizedChat(chatId) {
        return deleteAuthorizedChatStatement.run(chatId).changes > 0;
    },
    getTrackedUserIds() {
        return getTrackedUserIdsStatement.all().map((row) => row.user_id);
    },
    getTrackedGroupIds() {
        return getTrackedGroupIdsStatement.all().map((row) => row.chat_id);
    },
    addTrackedUser(userId) {
        return addTrackedUserStatement.run(userId).changes > 0;
    },
    addTrackedGroup(chatId, title) {
        return addTrackedGroupStatement.run(chatId, title || String(chatId)).changes > 0;
    }
};
