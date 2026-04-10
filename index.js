const strip = require('./strip')
const ai = require('./ai')
const fs = require('hexo-fs')
const fm = require('hexo-front-matter')
const pLimit = require('p-limit')

// 日志等级枚举
const LOG_LEVELS = {
    SILENT: 0,   // 只输出错误
    NORMAL: 1,   // 输出错误和需要生成摘要的文章
    VERBOSE: 2   // 输出所有信息，包括跳过的文章
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

function getPositiveNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function getNonNegativeNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function getLoggerLevel(value) {
    return value === LOG_LEVELS.SILENT || value === LOG_LEVELS.NORMAL || value === LOG_LEVELS.VERBOSE
        ? value
        : LOG_LEVELS.NORMAL
}

function normalizeConfig(rawConfig = {}) {
    const warnings = []
    const hasMaxInputToken = hasOwn(rawConfig, 'max_input_token')
    const hasDeprecatedMaxToken = hasOwn(rawConfig, 'max_token')

    let maxInputToken = 1000
    if (typeof rawConfig.max_input_token === 'number' && Number.isFinite(rawConfig.max_input_token) && rawConfig.max_input_token > 0) {
        maxInputToken = rawConfig.max_input_token
    } else if (typeof rawConfig.max_token === 'number' && Number.isFinite(rawConfig.max_token) && rawConfig.max_token > 0) {
        maxInputToken = rawConfig.max_token
    }

    if (hasDeprecatedMaxToken) {
        if (hasMaxInputToken) {
            warnings.push('[Hexo-AI-Summary-LiuShen] 配置项 max_token 已废弃，请尽快升级为 max_input_token；当前将优先使用 max_input_token。')
        } else {
            warnings.push('[Hexo-AI-Summary-LiuShen] 配置项 max_token 已废弃，请尽快升级为 max_input_token；当前版本仍兼容旧键。')
        }
    }

    return {
        config: {
            api: rawConfig.api,
            token: rawConfig.token,
            model: rawConfig.model,
            prompt: typeof rawConfig.prompt === 'string' && rawConfig.prompt.trim()
                ? rawConfig.prompt
                : '请为这些内容生成一个简短的摘要：',
            ignoreRules: Array.isArray(rawConfig.ignoreRules) ? rawConfig.ignoreRules : [],
            max_input_token: maxInputToken,
            max_output_token: getPositiveNumber(rawConfig.max_output_token, 2000),
            thinking: rawConfig.thinking === true,
            summary_field: typeof rawConfig.summary_field === 'string' && rawConfig.summary_field.trim()
                ? rawConfig.summary_field
                : 'summary',
            logger: getLoggerLevel(rawConfig.logger),
            concurrency: getPositiveNumber(rawConfig.concurrency, 2),
            sleep_time: getNonNegativeNumber(rawConfig.sleep_time, 0),
            enable: rawConfig.enable === true,
            cover_all: rawConfig.cover_all === true
        },
        warnings
    }
}

const rawConfig = hexo.config.aisummary || {}
const { config, warnings } = normalizeConfig(rawConfig)
warnings.forEach(message => console.warn(message))

if (!config.api) {
    console.error('[Hexo-AI-Summary-LiuShen] 请在配置文件中设置 api')
    return
}

const limit = pLimit(config.concurrency)
const fieldName = config.summary_field
const defaultPrompt = config.prompt
const sleepTime = config.sleep_time

// 获取当前的日志等级，默认为 NORMAL
const logLevel = config.logger

hexo.extend.filter.register('before_post_render', async function (data) {

    // 检查是否为文章页面
    if (data.layout != 'post' || !data.source.startsWith('_posts/')) {
        if (logLevel >= LOG_LEVELS.VERBOSE) {
            console.info(`[Hexo-AI-Summary-LiuShen] 跳过 ${data.title}，不是文章页面`)
        }
        return data
    }

    return await limit(async () => {
        if (!config.enable || data.is_summary === false) { // 感谢MCXiaoChen
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`[Hexo-AI-Summary-LiuShen] 文章 ${data.title} 被标记为不进行摘要，跳过`)
            }
            return data
        }
        if (data[fieldName] && data[fieldName].length > 0 && config.cover_all !== true) {
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`[Hexo-AI-Summary-LiuShen] 文章 ${data.title} 已经有摘要，跳过`)
            }
            return data
        }

        let content = strip(data.content, data.title, config)

        const path = this.source_dir + data.source
        const frontMatter = fm.parse(await fs.readFile(path))
        // 去掉 frontMatter 中的 _content，并保存到 MdContent 变量中，删除MDContent 文本开始可能存在的换行符
        const MdContent = frontMatter._content.replace(/^\n+|\n+$/g, '')
        delete frontMatter._content

        try {
            const ai_content = await ai(
                config.token,
                config.api,
                config.model,
                content,
                defaultPrompt,
                config.max_output_token,
                config.thinking
            )

            // 检测内容是否为空，是否有换行，是否有#,$,%之类的特殊字符
            if (!ai_content || ai_content.length < 10 || /[\n#$%]/.test(ai_content)) {
                if (logLevel >= LOG_LEVELS.NORMAL) {
                    console.info(`[Hexo-AI-Summary-LiuShen] 文章 ${data.title} 的摘要内容不符合要求，跳过`)
                }
                if (logLevel >= LOG_LEVELS.VERBOSE) {
                    console.info(`[Hexo-AI-Summary-LiuShen] 文章 ${data.title} 的摘要内容为：${ai_content}`)
                }
                return data
            }

            frontMatter[fieldName] = data[fieldName] = ai_content

            await fs.writeFile(path, `---\n${fm.stringify(frontMatter)}\n${MdContent}`)
            if (logLevel >= LOG_LEVELS.NORMAL) {
                console.info(`[Hexo-AI-Summary-LiuShen] 摘要 ${data.title} 完成`)
            }
        } catch (err) {
            if (logLevel >= LOG_LEVELS.SILENT) {
                console.error(`[Hexo-AI-Summary-LiuShen] 生成摘要失败：${data.title}\n${err.message}`)
            }
        }

        // 如果设置了休眠时间，则等待指定时间(毫秒)
        if (sleepTime > 0) {
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`[Hexo-AI-Summary-LiuShen] 处理完毕一篇文章，休眠 ${sleepTime} 毫秒...`)
            }
            await new Promise(resolve => setTimeout(resolve, sleepTime))
        }

        return data
    })
})
