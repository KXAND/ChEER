export const selectionReplaceMap = new Map<string, { left: string; right: string }>([
    // 括号
    ["【", { left: "【", right: "】" }],
    ["《", { left: "《", right: "》" }],
    ["<", { left: "<", right: ">" }],
    ["（", { left: "（", right: "）" }],
    ["(", { left: "(", right: ")" }],
    // 引号
    ["“", { left: "“", right: "”" }],
    ["”", { left: "“", right: "”" }],
    ["‘", { left: "‘", right: "’" }],
    ["’", { left: "‘", right: "’" }],
    ['"', { left: '"', right: '"' }],
    ["'", { left: "'", right: "'" }],
    ['「', { left: '「', right: '」' }],
    ['『', { left: '『', right: '』' }],
    // Markdown 符号
    ['￥', { left: '$', right: '$' }],
    ['$', { left: '$', right: '$' }],
    ['·', { left: '`', right: '`' }],
    ['`', { left: '`', right: '`' }],
    ['～', { left: '~', right: '~' }],
    ['~', { left: '~', right: '~' }],
    ['＊', { left: '*', right: '*' }],
    ['*', { left: '*', right: '*' }],
]);

export const selectionInsertMap = new Map<string, { left: string; right: string }>([
    // 括号
    ["【", { left: "【", right: "】" }],
    ["《", { left: "《", right: "》" }],
    ["<", { left: "<", right: ">" }],
    ["（", { left: "（", right: "）" }],
    ["(", { left: "(", right: ")" }],
    // 引号
    ["“", { left: "“", right: "”" }],
    ["”", { left: "“", right: "”" }],
    ["‘", { left: "‘", right: "’" }],
    ["’", { left: "‘", right: "’" }],
    ['"', { left: '"', right: '"' }],
    ["'", { left: "'", right: "'" }],
    ['「', { left: '「', right: '」' }],
    ['『', { left: '『', right: '』' }],
    // Markdown 符号
    ['$', { left: '$', right: '$' }],
    ['`', { left: '`', right: '`' }],
    ['～', { left: '~', right: '~' }],
    ['~', { left: '~', right: '~' }],
]);

export const continuousInputCorrectionRules: { input: string, env: string; result: string }[] = ([
    /**
     * input：用户输入的值
     * environment：用|代表光标位置的环境表示。如果不关心右侧是否有字符，可以不写|。（必须要在结尾生效的case感觉很少见，不考虑）。也正因如此
     * result：替代的结果
     */
    // 括号
    { input: "。", env: "。", result: "." },
    { input: "。", env: "..", result: "…" },
    { input: "《", env: "《|》", result: "<|>" },
    { input: "《", env: "《", result: "<" },
    { input: "》", env: "》", result: ">" },
    { input: "（", env: "（", result: "(|)" },
    { input: "（", env: "（|）", result: "(|)" },
    { input: "【", env: "【", result: "[|]" },
    { input: "【", env: "【|】", result: "[|]" },
    // 引号
    // 中英文引号全部映射到 ASCII 引号
    { input: "“", env: "“", result: "“|”" },
    { input: "”", env: "“", result: "“|”" },
    { input: "“", env: "“|”", result: "\"|\"" },
    { input: "”", env: "“|”", result: "\"|\"" },
    { input: "‘", env: "‘", result: "‘|’" },
    { input: "’", env: "‘", result: "‘|’" },
    { input: "‘", env: "‘|’", result: "\"|\"" },
    { input: "’", env: "‘|’", result: "\"|\"" },
    { input: "\"", env: "\"|", result: "\"|\"" },
    { input: "\'", env: "\'|", result: "\'|\'" },
    //其它符号
    { input: "：", env: "：", result: ": " },
    { input: "、", env: "、", result: "\\" },
    // Markdown 符号
    { input: "￥", env: "￥", result: "$|$" },
    { input: "$", env: "$", result: "$|$" },
    { input: "￥", env: "$|$", result: "$$\n|$$\n" },
    { input: "$", env: "$|$", result: "$$\n|$$\n" },
    { input: "·", env: "·", result: "`|`" },
    { input: "`", env: "`", result: "`|`" },
    { input: "·", env: "`|`", result: "```|\n```\n" },
    { input: "`", env: "`|`", result: "```|\n```\n" },
    { input: "～", env: "～", result: "~|~" },
    { input: "~", env: "~", result: "~|~" },
    { input: "＊", env: "＊", result: "*|*" },
    { input: "*", env: "*", result: "*|*" },
]);

export const deletionRules: { left: string; right: string }[] = [
    // 括号
    { left: '【', right: '】' },
    { left: '《', right: '》' },
    { left: '（', right: '）' },
    { left: '(', right: ')' },
    { left: '<', right: '>' },
    { left: '{', right: '}' },
    // 引号
    { left: '“', right: '”' },
    { left: '‘', right: '’' },
    { left: '「', right: '」' },
    { left: '『', right: '』' },
    // 其它包裹符号
    { left: '\'', right: '\'' },
    { left: '"', right: '"' },
    { left: '`', right: '`' },
    { left: '$', right: '$' },
    { left: '*', right: '*' },

];

// 多行删除的 case 太少了，所以这里只检测了下一行
export const multiLinesDeletionRules: { currLine: string; nextLine: string }[] = [
    //多行
    { currLine: "```", nextLine: "```" },
    { currLine: "$$", nextLine: "$$" }
];

export const cjkPairMap: Record<string, string> = {
    '（': '）',
    '【': '】',
    '《': '》',
    '〈': '〉',
    '「': '」',
    '『': '』',
    '〔': '〕',
    '〖': '〗',
    '﹝': '﹞',
    '｛': '｝',
    '﹙': '﹚',
    '﹃': '﹄', // Presentation form brackets
    '“': '”',
    '‘': '’',
    '﹁': '﹂',
    '﹇': '﹈',
};