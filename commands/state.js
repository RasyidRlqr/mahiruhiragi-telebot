// Shared state module for bot statistics
const contentStore = require('./contentStore');

const state = {
    botStartTime: Date.now(),
    uniqueUsers: new Set(contentStore.getTrackedUserIds()),
    groups: new Set(contentStore.getTrackedGroupIds()),
    addGroup(chatId, title) {
        const isNew = contentStore.addTrackedGroup(chatId, title);
        this.groups.add(chatId);
        if (isNew) console.log(`Group ${chatId} tracked. Total groups: ${this.groups.size}`);
    },
    addUser(userId) {
        const isNew = contentStore.addTrackedUser(userId);
        this.uniqueUsers.add(userId);
        if (isNew) console.log(`User ${userId} tracked. Total users: ${this.uniqueUsers.size}`);
    }
};

module.exports = state;