const fetch = require('node-fetch')

const LOG_LEVELS = {
  SILENT: 0,
  NORMAL: 1,
  VERBOSE: 2
}

module.exports = async function ai(token, api, model, content, prompt, maxTokens, thinking, logLevel = LOG_LEVELS.NORMAL) {
  const url = api || 'https://api.openai.com/v1/chat/completions'

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }

  const body = {
    model: model || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: '所有摘要内容均不要换行，不要分段，不要分点，写在一段文本内即可！' + prompt },
      { role: 'user', content: content }
    ],
    max_tokens: maxTokens || 2000
  }

  if (thinking === true) {
    body.reasoning_effort = 'medium'
  }

  if (logLevel >= LOG_LEVELS.VERBOSE) {
    console.info(`[Hexo-AI-Summary-LiuShen] AI 请求参数：model=${body.model}，max_tokens=${body.max_tokens}，thinking=${thinking === true}`)
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`AI 请求失败 (${res.status}): ${errText}`)
    }

    const json = await res.json()
    const message = json.choices?.[0]?.message
    const reply = message?.content?.trim()

    if (logLevel >= LOG_LEVELS.VERBOSE) {
      console.info(`[Hexo-AI-Summary-LiuShen] AI 响应概览：has_choices=${Array.isArray(json.choices)}，has_content=${reply !== undefined && reply !== null && reply !== ''}`)
    }

    if (reply === undefined || reply === null) {
      throw new Error('OpenAI 返回的响应格式不正确，未找到 choices[0].message.content')
    }
    if (reply === '') {
      if (thinking === true) {
        throw new Error('思考链仍在输出但被 max_output_token 限制截断，导致最终 content 为空；请提高 max_output_token，或关闭 thinking 后重试')
      }
      throw new Error('content 为空但是请求成功，请检查模型返回内容是否异常')
    }

    const cleaned = reply
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[`]/g, '')
      .trim()

    const illegalChars = /[#`]/g
    if (cleaned.length > 500 && logLevel >= LOG_LEVELS.VERBOSE) {
      console.info('[Hexo-AI-Summary-LiuShen] AI 返回摘要不符合格式要求（长度超限）')
    }

    if (cleaned.match(illegalChars) && logLevel >= LOG_LEVELS.VERBOSE) {
      console.info('[Hexo-AI-Summary-LiuShen] AI 返回摘要不符合格式要求（包含非法字符）')
    }

    return cleaned
  } catch (error) {
    throw new Error(`AI 请求失败: ${error.message}`)
  }
}
