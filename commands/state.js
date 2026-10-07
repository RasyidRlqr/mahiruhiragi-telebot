// Shared state module for bot statistics
const state = {
    botStartTime: Date.now(),
    uniqueUsers: new Set(),
    groupJoins: 0,
    incrementGroupJoins() {
        this.groupJoins++;
        console.log(`Group join tracked. Total groups: ${this.groupJoins}`);
    },
    addUser(userId) {
        this.uniqueUsers.add(userId);
        console.log(`User ${userId} started tracking`);
    }
};

module.exports = state;