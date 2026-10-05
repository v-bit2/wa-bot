// commands/index.js
// Auto-loads every command file in this folder (except this one) into a Map
// keyed by command name, so adding a new command is just "add a new file".

const fs = require('fs');
const path = require('path');

function loadCommands() {
  const commands = new Map();
  const files = fs
    .readdirSync(__dirname)
    .filter((file) => file.endsWith('.js') && file !== 'index.js');

  for (const file of files) {
    const command = require(path.join(__dirname, file));
    if (!command?.name || typeof command.execute !== 'function') {
      console.warn(`[commands] skipping ${file}: missing "name" or "execute"`);
      continue;
    }

    const name = command.name.toLowerCase();
    if (commands.has(name)) {
      throw new Error(`Duplicate command name "${command.name}" defined in ${file}. Command names must be unique.`);
    }

    commands.set(name, command);
  }

  return commands;
}

module.exports = { loadCommands };
