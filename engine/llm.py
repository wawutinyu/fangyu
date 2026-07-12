import json
import httpx

PROVIDER_MAP = {
    'gpt-4o': 'openai', 'gpt-4o-mini': 'openai', 'gpt-4-turbo': 'openai', 'gpt-3.5-turbo': 'openai',
    'claude-3.5-sonnet': 'anthropic', 'claude-3.5-haiku': 'anthropic',
    'deepseek-chat': 'deepseek', 'deepseek-reasoner': 'deepseek', 'deepseek-v3': 'deepseek',
    'deepseek-r1': 'deepseek', 'deepseek-v4-flash': 'deepseek', 'deepseek-v4-pro': 'deepseek',
    'moonshot-v1-8k': 'moonshot', 'moonshot-v1-32k': 'moonshot', 'moonshot-v1-128k': 'moonshot',
}

PROVIDER_BASE_URL = {
    'openai': 'https://api.openai.com/v1',
    'deepseek': 'https://api.deepseek.com',
    'anthropic': 'https://api.anthropic.com',
    'moonshot': 'https://api.moonshot.cn/v1',
}


def get_provider(model: str) -> str:
    return PROVIDER_MAP.get(model, 'openai')


def _build_headers(api_key: str, provider_id: str) -> dict:
    if provider_id == 'anthropic':
        return {
            'Content-Type': 'application/json',
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
        }
    return {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    }


def _build_body(
    model: str, messages: list, temperature: float, max_tokens: int,
    thinking_mode: bool, reasoning_effort: str, provider_id: str, stream: bool = False,
    top_p: float | None = None, frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
) -> dict:
    if provider_id == 'anthropic':
        system = None
        filtered = []
        for msg in messages:
            if msg['role'] == 'system':
                system = msg['content']
            else:
                filtered.append(msg)
        body = {'model': model, 'messages': filtered, 'max_tokens': max_tokens, 'temperature': temperature}
        if system:
            body['system'] = system
        if stream:
            body['stream'] = True
        return body

    body = {
        'model': model,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': max_tokens,
    }
    if top_p is not None:
        body['top_p'] = top_p
    if frequency_penalty is not None:
        body['frequency_penalty'] = frequency_penalty
    if presence_penalty is not None:
        body['presence_penalty'] = presence_penalty
    if provider_id == 'deepseek' and thinking_mode:
        body['thinking'] = {'type': 'enabled'}
        body['reasoning_effort'] = reasoning_effort
    if stream:
        body['stream'] = True
    return body


async def chat_completion(
    model: str,
    messages: list,
    api_key: str,
    base_url: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    thinking_mode: bool = False,
    reasoning_effort: str = 'medium',
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
) -> dict:
    if not api_key:
        return {'result': '[错误: API Key 未配置，请在设置中填写]', 'usage': {}}

    provider_id = get_provider(model)

    if provider_id == 'anthropic':
        return await _call_anthropic(api_key, base_url, model, messages, max_tokens, temperature)
    else:
        return await _call_openai_compat(provider_id, api_key, base_url, model, messages, temperature, max_tokens, thinking_mode, reasoning_effort, top_p, frequency_penalty, presence_penalty)


async def _call_openai_compat(
    provider_id: str,
    api_key: str,
    base_url: str,
    model: str,
    messages: list,
    temperature: float,
    max_tokens: int,
    thinking_mode: bool,
    reasoning_effort: str,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
) -> dict:
    url = f'{base_url.rstrip("/")}/chat/completions'
    headers = _build_headers(api_key, provider_id)
    body = _build_body(model, messages, temperature, max_tokens, thinking_mode, reasoning_effort, provider_id, False, top_p, frequency_penalty, presence_penalty)

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            json = resp.json()
            choice = json['choices'][0]
            msg = choice.get('message') or {}
            content = msg.get('content') or msg.get('reasoning_content') or ''
            return {'result': content, 'usage': json.get('usage', {})}
        except httpx.HTTPStatusError as e:
            return {'result': f'[API 错误 {e.response.status_code}: {e.response.text}]', 'usage': {}}
        except httpx.RequestError as e:
            return {'result': f'[网络错误: {e}]', 'usage': {}}


async def _call_anthropic(
    api_key: str,
    base_url: str,
    model: str,
    messages: list,
    max_tokens: int,
    temperature: float,
) -> dict:
    url = f'{base_url.rstrip("/")}/v1/messages'
    headers = _build_headers(api_key, 'anthropic')
    body = _build_body(model, messages, temperature, max_tokens, False, '', 'anthropic')

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            json = resp.json()
            content = ''.join(block.get('text', '') for block in json.get('content', []))
            return {
                'result': content,
                'usage': {
                    'prompt_tokens': json.get('usage', {}).get('input_tokens', 0),
                    'completion_tokens': json.get('usage', {}).get('output_tokens', 0),
                },
            }
        except httpx.HTTPStatusError as e:
            return {'result': f'[API 错误 {e.response.status_code}: {e.response.text}]', 'usage': {}}
        except httpx.RequestError as e:
            return {'result': f'[网络错误: {e}]', 'usage': {}}


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------


async def chat_completion_stream(
    model: str,
    messages: list,
    api_key: str,
    base_url: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    thinking_mode: bool = False,
    reasoning_effort: str = 'medium',
):
    if not api_key:
        yield f'data: {json.dumps({"error": "API Key 未配置"})}\n\n'
        yield 'data: [DONE]\n\n'
        return

    provider_id = get_provider(model)

    if provider_id == 'anthropic':
        async for event in _stream_anthropic(api_key, base_url, model, messages, max_tokens, temperature):
            yield event
    else:
        async for event in _stream_openai_compat(provider_id, api_key, base_url, model, messages, temperature, max_tokens, thinking_mode, reasoning_effort):
            yield event


async def _stream_openai_compat(
    provider_id, api_key, base_url, model, messages, temperature, max_tokens, thinking_mode, reasoning_effort,
):
    url = f'{base_url.rstrip("/")}/chat/completions'
    headers = _build_headers(api_key, provider_id)
    body = _build_body(model, messages, temperature, max_tokens, thinking_mode, reasoning_effort, provider_id, stream=True)

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream('POST', url, json=body, headers=headers) as resp:
                if resp.status_code != 200:
                    error_text = await resp.aread()
                    yield f'data: {json.dumps({"error": f"API {resp.status_code}: {error_text.decode()}"})}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                buffer = ''
                async for chunk in resp.aiter_bytes():
                    buffer += chunk.decode()
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()
                        if line.startswith('data: '):
                            data_str = line[6:]
                            if data_str == '[DONE]':
                                yield 'data: [DONE]\n\n'
                                return
                            try:
                                data = json.loads(data_str)
                                choice = data.get('choices', [{}])[0]
                                delta = choice.get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    yield f'data: {json.dumps({"token": content})}\n\n'
                            except json.JSONDecodeError:
                                pass
        except httpx.RequestError as e:
            yield f'data: {json.dumps({"error": f"网络错误: {e}"})}\n\n'
            yield 'data: [DONE]\n\n'


async def _stream_anthropic(api_key, base_url, model, messages, max_tokens, temperature):
    url = f'{base_url.rstrip("/")}/v1/messages'
    headers = _build_headers(api_key, 'anthropic')
    body = _build_body(model, messages, temperature, max_tokens, False, '', 'anthropic', stream=True)

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream('POST', url, json=body, headers=headers) as resp:
                if resp.status_code != 200:
                    error_text = await resp.aread()
                    yield f'data: {json.dumps({"error": f"API {resp.status_code}: {error_text.decode()}"})}\n\n'
                    yield 'data: [DONE]\n\n'
                    return

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if line.startswith('data: '):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            if data.get('type') == 'content_block_delta':
                                delta = data.get('delta', {})
                                text = delta.get('text', '')
                                if text:
                                    yield f'data: {json.dumps({"token": text})}\n\n'
                        except json.JSONDecodeError:
                            pass
                yield 'data: [DONE]\n\n'
        except httpx.RequestError as e:
            yield f'data: {json.dumps({"error": f"网络错误: {e}"})}\n\n'
            yield 'data: [DONE]\n\n'
