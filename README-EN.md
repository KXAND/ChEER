# ChEER: Chinese Editing Enhancement & Refinement

[中文](./README.md) | English

Inspired by [Yaozhuwa/easy-typing-obsidian](https://github.com/Yaozhuwa/easy-typing-obsidian), **ChEER** is a VS Code extension designed to enhance the Chinese editing experience.

---

## Features

- **Paired Chinese symbol input**: Provides a pairing experience for Chinese punctuation similar to English paired symbols. Example: type `《` -> `《》`.
- **Chinese symbol wrapping**: Paired Chinese symbols can wrap selected content instead of replacing it. Example: select text -> type `《` -> `《selected text》`.
- **Continuous input conversion**: Repeatedly typing certain Chinese characters can convert them into corresponding Latin characters. Example: `《` -> type `《` again -> `<`.
- **Paired Chinese symbol deletion**: Provides paired deletion for Chinese punctuation, similar to English paired symbols. Example: backspace on `《|》` -> `|`.
- **Empty list item deletion**: Delete an entire empty list item with a single action.
- **Pangu formatting**: Keeps your document aligned with @sparanoid's Chinese copywriting guidelines by inserting proper spaces between Chinese and English or numbers. See [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines).

---

## Known Issues

1. Undoing Chinese input may require multiple undo operations in some cases.
2. Paired deletion may conflict with other extensions that also intercept the `Backspace` key, such as `Markdown All in One`. If you want to enable ChEER's smart paired deletion, you need to adjust your VS Code keybinding priority. Press `Ctrl + Shift + P`, run `Preferences: Open Keyboard Shortcuts (JSON)`, and add this user-level override:

   ```json
   {
     "key": "backspace",
     "command": "CHEER.SmartDelete",
     "when": "editorTextFocus && !editorReadonly"
   }
   ```

## Credits

We referenced the following projects:

- [Yaozhuwa/easy-typing-obsidian](https://github.com/Yaozhuwa/easy-typing-obsidian)
- [formulahendry/vscode-auto-close-tag](https://github.com/formulahendry/vscode-auto-close-tag)
- [VSCodeVim/Vim](https://github.com/VSCodeVim/Vim)
- [vinta/pangu.js: Opinionated paranoid text spacing in JavaScript](https://github.com/vinta/pangu.js)

---

## License

MIT License
