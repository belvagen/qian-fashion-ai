// ============================================
// QIAN Fashion AI — логика Mini App
// ============================================

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
// ВАЖНО: этот URL мы заменим на Шаге 15,
// когда задеплоим Cloudflare Worker.
const API_URL = 'https://qian-fashion-api.belvagen.workers.dev';

// ============================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================
let uploadedImage = null;    // base64 загруженного фото
let selectedGender = null;   // 'male' или 'female'
let generatedImage = null;   // base64 сгенерированного фото

// ============================================
// ЭЛЕМЕНТЫ DOM
// ============================================
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const resultImage = document.getElementById('resultImage');
const genderBtns = document.querySelectorAll('.gender-btn');

// ============================================
// ЗАГРУЗКА ФОТО ОДЕЖДЫ
// ============================================
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Проверка размера файла (не больше 10 МБ)
    if (file.size > 10 * 1024 * 1024) {
        alert('Файл слишком большой. Максимум 10 МБ.');
        return;
    }

    // Проверка типа файла
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, загрузите изображение.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedImage = event.target.result;
        preview.src = uploadedImage;
        preview.style.display = 'block';
        uploadArea.classList.add('has-image');
        
        // Скрыть иконку и текст после загрузки
        const icon = document.querySelector('.upload-icon');
        const text = document.querySelector('.upload-text');
        if (icon) icon.style.display = 'none';
        if (text) text.style.display = 'none';
        
        checkFormReady();
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    };
    reader.readAsDataURL(file);
});

// ============================================
// ВЫБОР ПОЛА МОДЕЛИ
// ============================================
genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        genderBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedGender = btn.dataset.gender;
        checkFormReady();
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    });
});

// ============================================
// ПРОВЕРКА ГОТОВНОСТИ ФОРМЫ
// ============================================
function checkFormReady() {
    generateBtn.disabled = !(uploadedImage && selectedGender);
}

// ============================================
// ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЯ
// ============================================
generateBtn.addEventListener('click', async () => {
    if (!uploadedImage || !selectedGender) return;

    // Показать лоадер, скрыть прошлый результат
    loading.style.display = 'block';
    resultImage.style.display = 'none';
    generateBtn.disabled = true;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    try {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: uploadedImage,
                gender: selectedGender
            })
        });

        if (!response.ok) {
            throw new Error(`Сервер вернул ошибку: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            generatedImage = data.imageUrl;
            resultImage.src = generatedImage;
            resultImage.style.display = 'block';
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            alert('Ошибка генерации: ' + (data.error || 'неизвестная ошибка'));
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Не удалось связаться с сервером. Попробуйте позже.\n\n' + error.message);
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } finally {
        loading.style.display = 'none';
        generateBtn.disabled = false;
    }
});

// ============================================
// ЛОГ ДЛЯ ОТЛАДКИ
// ============================================
console.log('QIAN Fashion AI: приложение загружено');
console.log('API_URL:', API_URL);