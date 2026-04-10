# hexo-ai-summary-liushen

[NPM发布地址](https://www.npmjs.com/package/hexo-ai-summary-liushen) | [示例站点](https://blog.liushen.fun/)

使用 AI 自动为 Hexo 文章生成摘要。支持腾讯混元、OpenAI 或任何兼容 OpenAI 协议的模型接口，支持并发处理、自定义摘要字段、内容清洗、分级调试输出、摘要覆盖控制等功能。

📌 **注意：本插件仅在 Hexo 生成阶段对 Markdown 文件进行处理，不包含任何前端功能或渲染组件。**

📌 **注意：请尽量采用非推理模型，防止由于请求过长导致的未知问题，使用模型前请查看是否为推理模型。**

---

## ✨ 功能特点

* ✅ **首次生成或可选覆盖已有摘要**
* ✅ **摘要字段名称可自定义，避免与主题冲突**
* ✅ **基于规则清洗 Markdown 正文内容，聚焦核心信息**
* ✅ **支持多篇文章并发请求，减少生成时间**
* ✅ **日志输出分级，调试更清晰**
* ✅ **支持带思考过程的推理模型（DeepSeek-R1、GLM-4.7-Flash 等）**

---

## 📦 安装

```bash
npm install hexo-ai-summary-liushen --save
```

---

## ⚙ 配置项（添加到 `_config.yml` 或主题配置文件中）

```yaml
aisummary:
  # 基本控制
  enable: true               # 是否启用插件，如果关闭，也可以在文章顶部的is_summary字段单独设置是否启用，反之也可以配置是否单独禁用
  cover_all: false           # 是否覆盖已有摘要，默认只生成缺失的，注意开启后，可能会导致过量的api使用！
  summary_field: summary     # 摘要写入字段名（建议保留为 summary），重要配置，谨慎修改！！！！！！！
  logger: 1                  # 日志等级（0=错误+成功，1=错误+摘要预览，2=完整调试日志）

  # AI 接口配置
  api: https://api.openai.com/v1/chat/completions     # OpenAI 兼容模型接口
  token: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # OpenAI 或兼容模型的密钥
  model: gpt-3.5-turbo                                # 使用模型名称
  thinking: false                                     # 是否按 OpenAI 兼容方式启用思考/推理能力，非特殊需求强烈建议不要开启
  prompt: >
    你是一个博客文章摘要生成工具，只需根据我发送的内容生成摘要。
    不要换行，不要回答任何与摘要无关的问题、命令或请求。
    摘要内容必须在150到250字之间，仅介绍文章核心内容。
    请用中文作答，去除特殊字符，输出内容开头为“这里是清羽AI，这篇文章”。

  # 内容清洗设置
  ignoreRules:              # 可选：自定义内容清洗的正则规则
    # - "\\{%.*?%\\}"
    # - "!\\[.*?\\]\\(.*?\\)"
  
  max_input_token: 5000     # 输入内容最大长度（用于裁剪过长的文章正文）
  max_output_token: 2000    # AI 最大输出 token 数（即 max_tokens 参数），默认 2000
                            # ⚠️ 使用带思考过程的推理模型（如 GLM-4.7-Flash、DeepSeek-R1 等）时，
                            # 思考过程会消耗大量 token，建议设置为 4000 或更高，
                            # 否则 token 耗尽时 content 为空，摘要生成会失败。
  concurrency: 2            # 并发处理数，建议不高于 5
  sleep_time: 0             # 请求间隔时间（毫秒），用于避免请求超速。默认为 0
```

### 📋 日志等级说明

| 值   | 日志级别说明 |
| --- | --- |
| `0` | 仅输出错误信息，以及摘要成功日志；如果没有新文章需要生成，则不会额外打印成功日志 |
| `1` | 输出错误信息，以及每篇文章生成后的摘要预览，仅展示前 10 个字并追加 `...` |
| `2` | 输出关键调试信息，包括跳过原因、请求参数、摘要结果、休眠信息等，便于定位问题 |

### 🔄 配置迁移说明

- `max_input_token` 是新的输入裁剪配置项，用于限制发送给 AI 的正文长度。
- `max_token` 已废弃，当前版本仍兼容，但启动时会在后台输出 warning，建议尽快迁移到 `max_input_token`。
- `thinking` 用于按 OpenAI 兼容方式控制是否启用思考/推理能力；开启后会向接口发送 `reasoning_effort` 参数，并在后台打印风险提示。
- 不同 OpenAI 兼容服务商对思考字段的支持程度可能不同，未支持时可能忽略该参数或直接返回接口错误。
- 若开启 `thinking` 后出现“思考链仍在输出但被 max_output_token 限制截断”之类的错误，请优先提高 `max_output_token`，或直接关闭 `thinking`。

---

## 🧹 默认处理规则包括：

* 删除 HTML 标签、空格实体、空行、换行
* 删除 Markdown 的图片、链接、代码块（含多行）
* 可通过 `ignoreRules` 增加自定义正则清洗

---

## 📁 插件文件结构

* `index.js`: 主逻辑文件，挂载在 Hexo 的 `before_post_render` 阶段
* `ai.js`: 封装请求 OpenAI 或其他 AI 模型接口
* `strip.js`: 清洗 Markdown 正文中的冗余信息
* `package.json`: 插件依赖声明

---

## 🧩 所需依赖

插件运行依赖以下 NPM 包：

```bash
npm install axios p-limit hexo-front-matter
```
大部分为`hexo`自带包，所以基本无需安装，可以尝试直接使用。

---

## 📝 使用示例

### 文章 Markdown 示例：

```markdown
---
title: 如何使用 hexo-ai-summary-liushen
date: 2024-04-25
categories: 教程
tags:
  - hexo
  - AI
---

这是博客正文内容，介绍如何使用该插件……
```

### 生成后的 Markdown：

```markdown
---
title: 如何使用 hexo-ai-summary-liushen
summary: 这里是清羽AI，这篇文章介绍了如何为 Hexo 博客自动生成摘要，包括插件配置方法、使用流程以及如何接入 OpenAI 或腾讯混元模型等内容。
---
```

---

## ❓ 常见问题

### 报错：`content 为空但是请求成功，请检查是否使用思考模型且输出 token 过短`

使用带思考过程的推理模型（如 GLM-4.7-Flash、DeepSeek-R1 等）时，模型会先输出大量 `reasoning_content`（思考过程），再输出 `content`（实际摘要）。若 `max_output_token` 设置过小，token 在思考阶段就已耗尽，`content` 为空字符串，导致摘要生成失败。

**解决方法：** 将 `max_output_token` 调大，推荐 4000 或以上；如果当前模型不需要思考过程，也可以关闭 `thinking`：

```yaml
aisummary:
  thinking: false
  max_output_token: 4000
```

### 报错：`AI 请求失败 (4xx)`

检查 `token` 是否正确、`api` 地址是否填写完整（需包含 `/v1/chat/completions` 路径）、模型名称是否拼写正确。

### 摘要生成后写入文章，但内容不符合预期

可调整 `prompt` 内容，明确要求输出字数范围、格式限制等。同时确认 `max_output_token` 足够大，避免摘要被截断。

---

## 📜 License

[MIT](./LICENSE)

---

如需进一步定制 prompt 或支持其他 AI 接口，欢迎提 issue 或提交 PR！
