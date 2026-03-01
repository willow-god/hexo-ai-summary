const fetch = require('node-fetch')

module.exports = async function ai(token, api, model, content, prompt, maxTokens) {
  const url = api || 'https://api.openai.com/v1/chat/completions'

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }

  const body = {
    model: model || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: "所有摘要内容均不要换行，不要分段，不要分点，写在一段文本内即可！" + prompt },
      { role: 'user', content: content}
    ],
    max_tokens: maxTokens || 2000
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

    // 如果返回格式不正确，抛出错误
    const reply = json.choices?.[0]?.message?.content?.trim()
    if (reply === undefined || reply === null) {
      throw new Error('OpenAI 返回的响应格式不正确')
    }
    if (reply === '') {
      throw new Error('content 为空但是请求成功，请检查是否使用思考模型且输出 token 过短（max_output_token 设置不足）')
    }

    // 后处理与校验
    const cleaned = reply
      .replace(/[\r\n]+/g, ' ') // 去换行
      .replace(/\s+/g, ' ')     // 合并多空格
      .replace(/[`]/g, '')      // 去"`"符号
      .trim()

    // 校验非法字符和最大长度
    const illegalChars = /[#`]/g
    if (cleaned.length > 500) {
      console.info('[Hexo-AI-Summary-LiuShen] AI 返回摘要不符合格式要求（长度超限）')
    }

    if (cleaned.match(illegalChars)) {
      console.info('[Hexo-AI-Summary-LiuShen] AI 返回摘要不符合格式要求（包含非法字符）')
    }

    return cleaned

  } catch (error) {
    // 捕获并抛出请求中的任何错误
    throw new Error(`AI 请求失败: ${error.message}`)
  }
}
