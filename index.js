const strip = require('./strip')
const ai = require('./ai')
const hexoFs = require('hexo-fs')
const nodeFs = require('fs').promises
const path = require('path')
const fm = require('hexo-front-matter')
const pLimit = require('p-limit')

const PLUGIN_PREFIX = '[Hexo-AI-Summary-LiuShen]'

// 日志等级枚举
const LOG_LEVELS = {
    SILENT: 0,   // 只输出错误和成功
    NORMAL: 1,   // 输出错误和摘要预览
    VERBOSE: 2   // 输出调试信息
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

function getSummaryPreview(summary) {
    return `${summary.slice(0, 10)}...`
}

async function writeFrontMatterSafely(filePath, frontMatter, mdContent) {
    const dir = path.dirname(filePath)
    const base = path.basename(filePath)
    const suffix = `${process.pid}-${Date.now()}`
    const tempPath = path.join(dir, `${base}.aisummary.${suffix}.tmp`)
    const backupPath = path.join(dir, `${base}.aisummary.${suffix}.bak`)
    const nextContent = `---\n${fm.stringify(frontMatter)}\n${mdContent}`

    await hexoFs.writeFile(tempPath, nextContent)

    let originalMoved = false

    try {
        await nodeFs.rename(filePath, backupPath)
        originalMoved = true
        await nodeFs.rename(tempPath, filePath)
    } catch (error) {
        if (originalMoved) {
            try {
                await nodeFs.rename(backupPath, filePath)
            } catch (restoreError) {
                throw new Error(`写入文章文件失败，且恢复原文件失败：${restoreError.message}；原始错误：${error.message}`)
            }
        }
        throw new Error(`写入文章文件失败，原文件未被覆盖：${error.message}`)
    } finally {
        await nodeFs.unlink(tempPath).catch(() => {})
        await nodeFs.unlink(backupPath).catch(() => {})
    }
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
            warnings.push(`${PLUGIN_PREFIX} 配置项 max_token 已废弃，请尽快升级为 max_input_token；当前将优先使用 max_input_token。`)
        } else {
            warnings.push(`${PLUGIN_PREFIX} 配置项 max_token 已废弃，请尽快升级为 max_input_token；当前版本仍兼容旧键。`)
        }
    }

    if (rawConfig.thinking === true) {
        warnings.push(`${PLUGIN_PREFIX} 已开启思考链，可能造成摘要失败，非必要不要开启。`)
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
    console.error(`${PLUGIN_PREFIX} 请在配置文件中设置 api`)
    return
}

const limit = pLimit(config.concurrency)
const fieldName = config.summary_field
const defaultPrompt = config.prompt
const sleepTime = config.sleep_time
const logLevel = config.logger

if (logLevel >= LOG_LEVELS.VERBOSE) {
    console.info(`${PLUGIN_PREFIX} 插件启动：field=${fieldName}，concurrency=${config.concurrency}，max_input_token=${config.max_input_token}，max_output_token=${config.max_output_token}，thinking=${config.thinking}`)
}

hexo.extend.filter.register('before_post_render', async function (data) {
    if (data.layout != 'post' || typeof data.source !== 'string' || !data.source.startsWith('_posts/')) {
        if (logLevel >= LOG_LEVELS.VERBOSE) {
            console.info(`${PLUGIN_PREFIX} 跳过 ${data.title}，不是文章页面`)
        }
        return data
    }

    return await limit(async () => {
        if (!config.enable || data.is_summary === false) { // 感谢MCXiaoChen
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`${PLUGIN_PREFIX} 文章 ${data.title} 被标记为不进行摘要，跳过`)
            }
            return data
        }
        if (data[fieldName] && data[fieldName].length > 0 && config.cover_all !== true) {
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`${PLUGIN_PREFIX} 文章 ${data.title} 已经有摘要，跳过`)
            }
            return data
        }

        const content = strip(data.content, data.title, config)
        const filePath = path.join(this.source_dir, data.source)

        if (logLevel >= LOG_LEVELS.VERBOSE) {
            console.info(`${PLUGIN_PREFIX} 开始生成摘要：title=${data.title}，source=${data.source}，model=${config.model || 'gpt-3.5-turbo'}，thinking=${config.thinking}`)
        }

        try {
            const frontMatter = fm.parse(await hexoFs.readFile(filePath))
            const mdContent = typeof frontMatter._content === 'string'
                ? frontMatter._content.replace(/^\n+|\n+$/g, '')
                : ''
            delete frontMatter._content

            const aiContent = await ai(
                config.token,
                config.api,
                config.model,
                content,
                defaultPrompt,
                config.max_output_token,
                config.thinking,
                logLevel
            )

            if (!aiContent || aiContent.length < 10 || /[\n#$%]/.test(aiContent)) {
                console.error(`${PLUGIN_PREFIX} 生成摘要失败：${data.title}\nAI 返回的摘要内容不符合要求（长度不足或包含非法字符）`)
                if (logLevel >= LOG_LEVELS.VERBOSE) {
                    console.info(`${PLUGIN_PREFIX} 异常摘要内容：${aiContent}`)
                }
                return data
            }

            frontMatter[fieldName] = aiContent
            await writeFrontMatterSafely(filePath, frontMatter, mdContent)
            data[fieldName] = aiContent

            if (logLevel === LOG_LEVELS.SILENT) {
                console.info(`${PLUGIN_PREFIX} 摘要 ${data.title} 完成`)
            } else if (logLevel === LOG_LEVELS.NORMAL) {
                console.info(`${PLUGIN_PREFIX} ${data.title} 摘要：${getSummaryPreview(aiContent)}`)
            } else {
                console.info(`${PLUGIN_PREFIX} 摘要 ${data.title} 完成：${aiContent}`)
            }
        } catch (err) {
            console.error(`${PLUGIN_PREFIX} 生成摘要失败：${data.title}\n${err.message}`)
        }

        if (sleepTime > 0) {
            if (logLevel >= LOG_LEVELS.VERBOSE) {
                console.info(`${PLUGIN_PREFIX} 处理完毕一篇文章，休眠 ${sleepTime} 毫秒...`)
            }
            await new Promise(resolve => setTimeout(resolve, sleepTime))
        }

        return data
    })
})
