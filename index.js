const strip = require('./strip')
const ai = require('./ai')
const fs = require('hexo-fs')
const fm = require('hexo-front-matter')
const pLimit = require('p-limit')

const config = hexo.config.aisummary || {}
if (!config.api) {
    console.error('[Hexo-AI-Summary-LiuShen] 请在配置文件中设置 api')
    return
}

const limit = pLimit(config.concurrency || 2)  // 设置最大并发数，比如 2
const fieldName = config.summary_field || 'summary'   // 默认为 'summary'
const defaultPrompt = config.prompt || '请为这些内容生成一个简短的摘要：'
const sleepTime = config.sleep_time || 0  // 请求间隔时间，单位毫秒，默认为0

// 日志等级枚举
const LOG_LEVELS = {
    SILENT: 0,   // 只输出错误
    NORMAL: 1,   // 输出错误和需要生成摘要的文章
    VERBOSE: 2   // 输出所有信息，包括跳过的文章
}

// 获取当前的日志等级，默认为 NORMAL
const logLevel = config.logger ?? LOG_LEVELS.NORMAL

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
                config.max_output_token || 2000
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
