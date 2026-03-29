# ChEER: Chinese Editing Enhancement & Refinement

中文 | [English](./README-EN.md)

启发自 [Yaozhuwa/easy-typing-obsidian](https://github.com/Yaozhuwa/easy-typing-obsidian)，**ChEER** 是一个旨在增强中文编辑体验的 VS Code 插件。

---

## 功能特性

- **中文符号配对输入**：为中文符号提供类似英文成对符号的输入体验。例：输入`《`→`《》`。
- **中文符号包裹**：中文成对符号也能包裹选中内容，而非替换原文本。例：`选中内容`→输入`《`→`《选中内容》`。
- **连输转换**：通过连续输入中文字符，可以转换为对应拉丁字符。例：`《`→输入`《`→`<`。
- **中文符号配对删除**：为中文符号提供类似英文成对符号的删除体验。例：退格`《|》`→`|`。
- **空列表项删除**：一键删除整个空列表项。
- **盘古格式化**：保证你的文档遵循 @sparanoid 的中文排版规范，在中文和英文数字之间添加空格。详见 [sparanoid/中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)。

---

## 已知的问题

1. 可能需要多次 undo 才能撤回中文输入；
2. 配对删除功能可能和其他劫持了退格键的插件冲突，例如，`Markdown All in One`。如果希望启用 ChEER 的成对删除，你必须调你的 VS Code 设置，例如，按下 `Ctrl + Shift + P`，输入并选择 `Preferences: Open Keyboard Shortcuts (JSON)`，然后添加如下用户级覆盖：

   ```json
    {
        "key": "backspace",
        "command": "CHEER.SmartDelete",
        "when": "editorTextFocus && !editorReadonly"
    }
    ```

## 致谢

我们参考了以下项目

- [Yaozhuwa/easy-typing-obsidian](https://github.com/Yaozhuwa/easy-typing-obsidian)
- [formulahendry/vscode-auto-close-tag](https://github.com/formulahendry/vscode-auto-close-tag)
- [VSCodeVim/Vim](https://github.com/VSCodeVim/Vim)
- [vinta/pangu.js: Opinionated paranoid text spacing in JavaScript](https://github.com/vinta/pangu.js)

---

## 开源协议

MIT License
