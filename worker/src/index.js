// ============================================
// QIAN Fashion AI — Cloudflare Worker v5 (debug)
// Добавлен endpoint /debug-human для отладки
// ============================================

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // ============================================
        // ОТЛАДОЧНЫЙ ENDPOINT: /debug-human
        // ============================================
        if (path === '/debug-human') {
            try {
                const gender = url.searchParams.get('gender') || 'female';
                console.log('DEBUG: генерация человека, пол:', gender);
                const humanDataUrl = await generateHuman(env, gender);
                console.log('DEBUG: человек сгенерирован, длина:', humanDataUrl.length);
                return new Response(
                    JSON.stringify({ success: true, imageUrl: humanDataUrl }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } catch (error) {
                console.error('DEBUG ошибка:', error.message);
                return jsonError(error.message, 500, corsHeaders);
            }
        }

        // ============================================
        // ОСНОВНОЙ ENDPOINT: /generate
        // ============================================
        if (request.method !== 'POST') {
            return jsonError('Method not allowed', 405, corsHeaders);
        }

        try {
            const payload = await request.json();
            const { clothImage, mode, personImage, gender } = payload;

            if (!clothImage || !mode) {
                return jsonError('Не переданы обязательные параметры: clothImage, mode', 400, corsHeaders);
            }

            let humanImage;
            if (mode === 'upload') {
                if (!personImage) {
                    return jsonError('Не передано фото человека', 400, corsHeaders);
                }
                humanImage = personImage;
                console.log('Режим: загрузка своего фото');
            } else if (mode === 'generate') {
                if (!gender || (gender !== 'male' && gender !== 'female')) {
                    return jsonError('gender должен быть "male" или "female"', 400, corsHeaders);
                }
                console.log('Режим: генерация модели через Flux, пол:', gender);
                humanImage = await generateHuman(env, gender);
                console.log('Модель сгенерирована');
            } else {
                return jsonError('mode должен быть "upload" или "generate"', 400, corsHeaders);
            }

            console.log('Вызов IDM-VTON...');
            const resultImage = await callIDMVTON(env, humanImage, clothImage);
            console.log('IDM-VTON вернул результат, размер base64:', resultImage.length);

            return new Response(
                JSON.stringify({ success: true, imageUrl: resultImage }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );

        } catch (error) {
            console.error('Ошибка:', error.message);
            console.error('Stack:', error.stack);
            return jsonError(error.message || 'Внутренняя ошибка', 500, corsHeaders);
        }
    }
};

// ============================================
// Генерация человека через Flux
// ============================================
async function generateHuman(env, gender) {
    const base = 'professional fashion catalog photo, person standing, ' +
                 'wearing plain white t-shirt and neutral pants, ' +
                 'plain light gray background, studio photography, ';
    const genderPart = gender === 'male'
        ? 'man, short hair, confident neutral pose, '
        : 'woman, long hair, confident neutral pose, ';
    const style = 'photorealistic, high quality, sharp focus, soft studio light, ' +
                  'looking at camera, catalog model';

    const response = await env.AI.run(
        '@cf/black-forest-labs/flux-1-schnell',
        { prompt: base + genderPart + style, steps: 4 }
    );

    if (response && response.image) {
        return `data:image/png;base64,${response.image}`;
    }
    throw new Error('Flux не вернул изображение');
}

// ============================================
// Вызов IDM-VTON
// ============================================
async function callIDMVTON(env, humanImageDataUrl, clothImageDataUrl) {
    const hfToken = env.HF_TOKEN;
    if (!hfToken) throw new Error('HF_TOKEN не настроен');

    const baseUrl = 'https://yisol-idm-vton.hf.space';

    const humanFile = await uploadToGradio(baseUrl, humanImageDataUrl, hfToken, 'human.png');
    const clothFile = await uploadToGradio(baseUrl, clothImageDataUrl, hfToken, 'cloth.png');
    console.log('Файлы загружены');

    const editorData = {
        background: humanFile,
        layers: [],
        composite: null
    };

    const data = [
        editorData,
        clothFile,
        'fashion clothing item',
        true,
        false,
        30,
        42
    ];

    const resultUrl = await gradioPredict(baseUrl, hfToken, '/tryon', data);
    console.log('Результат URL:', resultUrl);

    const imgResp = await fetch(resultUrl, {
        headers: { 'Authorization': `Bearer ${hfToken}` }
    });
    if (!imgResp.ok) {
        throw new Error('Не удалось скачать результат: ' + imgResp.status);
    }
    const buffer = await imgResp.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
}

// ============================================
// Загрузка файла в Gradio
// ============================================
async function uploadToGradio(baseUrl, dataUrl, hfToken, filename) {
    const blob = dataUrlToBlob(dataUrl);

    const formData = new FormData();
    formData.append('files', blob, filename);

    const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${hfToken}`,
            'User-Agent': 'Mozilla/5.0 (compatible; QIAN-Fashion-AI/1.0)'
        },
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Загрузка файла: ${response.status} - ${text.substring(0, 200)}`);
    }

    const result = await response.json();
    const filePath = result[0];

    return {
        path: filePath,
        url: `${baseUrl}/file=${filePath}`,
        orig_name: filename,
        meta: { _type: 'gradio.FileData' }
    };
}

// ============================================
// Gradio 4.x prediction через SSE
// ============================================
async function gradioPredict(baseUrl, hfToken, apiName, data) {
    const sessionHash = Math.random().toString(36).substring(2, 15);

    const joinResp = await fetch(`${baseUrl}/queue/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${hfToken}`,
            'User-Agent': 'Mozilla/5.0 (compatible; QIAN-Fashion-AI/1.0)'
        },
        body: JSON.stringify({
            data: data,
            event_data: null,
            fn_index: 0,
            trigger_id: 22,
            session_hash: sessionHash,
            api_name: apiName
        })
    });

    if (!joinResp.ok) {
        const text = await joinResp.text();
        throw new Error(`queue/join: ${joinResp.status} - ${text.substring(0, 200)}`);
    }

    const joinData = await joinResp.json();
    console.log('queue/join OK, event_id:', joinData.event_id);

    const streamResp = await fetch(
        `${baseUrl}/queue/data?session_hash=${sessionHash}`,
        {
            headers: {
                'Authorization': `Bearer ${hfToken}`,
                'Accept': 'text/event-stream',
                'User-Agent': 'Mozilla/5.0 (compatible; QIAN-Fashion-AI/1.0)'
            }
        }
    );

    if (!streamResp.ok) {
        throw new Error(`queue/data: ${streamResp.status}`);
    }

    const reader = streamResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    let streamDone = false;

    while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
            console.log('SSE stream closed by server');
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.substring(6).trim();
            if (!jsonStr) continue;

            try {
                const event = JSON.parse(jsonStr);
                console.log('Event:', event.msg);

                if (event.msg === 'process_completed') {
                    console.log('=== PROCESS COMPLETED ===');
                    console.log('success:', event.success);
                    console.log('output:', JSON.stringify(event.output).substring(0, 500));

                    if (event.success && event.output && Array.isArray(event.output.data)) {
                        result = event.output.data;
                        console.log('Result extracted, length:', result.length);
                    } else if (event.output && event.output.error) {
                        throw new Error('Gradio error: ' + event.output.error);
                    }
                    streamDone = true;
                    break;
                } else if (event.msg === 'unexpected_error' || event.msg === 'close_stream') {
                    console.log('Stream closed:', event.msg);
                    streamDone = true;
                    break;
                }
            } catch (e) {
                if (e.message && e.message.startsWith('Gradio error')) throw e;
            }
        }
    }

    try { reader.releaseLock(); } catch (e) { /* ignore */ }

    if (!result || !result[0]) {
        throw new Error('IDM-VTON не вернул результат');
    }

    const output = result[0];
    if (typeof output === 'string') return output;
    if (output.url) return output.url;
    if (output.path) return `${baseUrl}/file=${output.path}`;

    throw new Error('Неизвестный формат: ' + JSON.stringify(output).substring(0, 200));
}

// ============================================
// Утилиты
// ============================================
function jsonError(message, status, headers) {
    return new Response(
        JSON.stringify({ success: false, error: message }),
        { status, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
}

function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
