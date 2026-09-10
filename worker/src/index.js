// ============================================
// QIAN Fashion AI — Cloudflare Worker
// ============================================

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response(
                JSON.stringify({ success: false, error: 'Method not allowed' }),
                { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        try {
            const { image, gender } = await request.json();

            if (!image || !gender) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Не переданы обязательные параметры: image, gender' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            if (gender !== 'male' && gender !== 'female') {
                return new Response(
                    JSON.stringify({ success: false, error: 'Параметр gender должен быть "male" или "female"' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const prompt = buildPrompt(gender);

            // Используем flux-1-schnell — более стабильная модель
        const aiResponse = await env.AI.run(
    '@cf/black-forest-labs/flux-1-schnell',
    {
        prompt: prompt,
        steps: 4
    }
);

            // flux-1-schnell возвращает объект { image: "base64..." }
            // (в отличие от SDXL, который возвращает бинарные данные)
            let base64Image;
            if (aiResponse && aiResponse.image) {
                base64Image = aiResponse.image;
            } else if (aiResponse instanceof ReadableStream) {
                // На случай, если Cloudflare изменит формат — читаем как stream
                const buffer = await new Response(aiResponse).arrayBuffer();
                base64Image = arrayBufferToBase64(buffer);
            } else if (aiResponse instanceof ArrayBuffer || aiResponse instanceof Uint8Array) {
                base64Image = arrayBufferToBase64(aiResponse);
            } else {
                throw new Error('Неожиданный формат ответа от ИИ: ' + JSON.stringify(aiResponse).substring(0, 200));
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    imageUrl: `data:image/png;base64,${base64Image}`
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );

        } catch (error) {
            console.error('Ошибка генерации:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message || 'Внутренняя ошибка сервера' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }
};

// ============================================
// Формирование промпта на основе пола
// ============================================
function buildPrompt(gender) {
    const base = 'professional fashion photography, full body shot, ' +
                 'studio lighting, high quality, photorealistic, 8k, ' +
                 'fashion model wearing stylish modern outfit, ';
    
    const genderPart = gender === 'male'
        ? 'handsome male model, masculine features, confident pose, '
        : 'beautiful female model, elegant features, graceful pose, ';
    
    const location = 'modern minimalist studio background, ' +
                     'clean aesthetic, professional photoshoot, sharp focus';
    
    return base + genderPart + location;
}

// ============================================
// Конвертация ArrayBuffer → base64
// ============================================
function arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}