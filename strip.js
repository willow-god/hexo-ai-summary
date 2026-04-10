module.exports = function strip(content, title, config) {
  const ignoreRules = config.ignoreRules || [];
  const logLevel = config.logger ?? 1; // 默认为 NORMAL

  // 1. 应用忽略规则
  if (Array.isArray(ignoreRules) && ignoreRules.length > 0) {
    ignoreRules.forEach(rule => {
      const regex = new RegExp(rule, 'g');
      content = content.replace(regex, '');
    });
  } else {
    if (logLevel >= 2) {
      console.warn('[Hexo-AI-Summary-LiuShen] ignore_rules 未设置或无效，跳过处理');
    }
  }

  // 在 NORMAL 或 VERBOSE 日志等级时输出原始字符串长度
  if (logLevel >= 1) {
    console.log('[Hexo-AI-Summary-LiuShen] 原始字符串长度：', content.length);
  }

  // 2. 清理内容
  content = content
    .replace(/```[\s\S]*?```/g, '省略代码')    // 代码块
    // .replace(/`[^`\n]+`/g, '')                // 行内代码
    .replace(/{%[^%]*%}/g, '')                // Hexo 标签
    .replace(/^\|.*?\|.*$/gm, '')             // 表格行
    .replace(/!\[.*?\]\(.*?\)/g, '')          // 图片
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')       // 超链接文本
    .replace(/<[^>]+>/g, '')                  // HTML 标签
    .replace(/&nbsp;/g, ' ')                  // 空格实体
    .replace(/\n{2,}/g, '\n')                 // 多重换行压缩
    .replace(/^\s+|\s+$/gm, '')               // 行首尾空格
    .replace(/[ \t]+/g, ' ')                  // 多空格压缩
    .trim();

  // 3. 拼接标题
  const combined = (title ? title.trim() + '\n\n' : '') + content;

  // 4. 截断处理
  const maxLen = typeof config.max_input_token === 'number' ? config.max_input_token : 1000;
  let final = combined;
  if (combined.length > maxLen) {
    final = combined.slice(0, maxLen).trim() + '...';
  }

  // 在 NORMAL 或 VERBOSE 日志等级时输出最终输出长度
  if (logLevel >= 1) {
    console.log('[Hexo-AI-Summary-LiuShen] 最终输出长度：', final.length);
  }

  return final;
};