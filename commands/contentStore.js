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
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_id, name)
    );
`);

const getRulesStatement = database.prepare(
    'SELECT content FROM chat_rules WHERE chat_id = ?'
);
const deleteRulesStatement = database.prepare(
    'DELETE FROM chat_rules WHERE chat_id = ?'
);
const saveRulesStatement = database.prepare(`
    INSERT INTO chat_rules (chat_id, content)
    VALUES (?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
`);
const getNoteStatement = database.prepare(
    'SELECT content FROM chat_notes WHERE chat_id = ? AND name = ?'
);
const deleteNoteStatement = database.prepare(
    'DELETE FROM chat_notes WHERE chat_id = ? AND name = ?'
);
const saveNoteStatement = database.prepare(`
    INSERT INTO chat_notes (chat_id, name, content)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id, name) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
`);

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
        return getNoteStatement.get(chatId, name)?.content;
    },
    saveNote(chatId, name, content) {
        saveNoteStatement.run(chatId, name, content);
    },
    deleteNote(chatId, name) {
        return deleteNoteStatement.run(chatId, name).changes > 0;
    }
};
