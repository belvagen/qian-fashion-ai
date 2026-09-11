// ============================================
// QIAN Fashion AI — логика Mini App (v2)
// Поддерживает: upload своего фото / generate модели
// ============================================

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

const API_URL = 'https://qian-fashion-api.belvagen.workers.dev';

// ============================================
// СОСТОЯНИЕ
// ============================================
let clothImage = null;
let personImage = null;
let sourceMode = 'upload';    // 'upload' или 'generate'
let selectedGender = null;

// ============================================
// ЭЛЕМЕНТЫ DOM
// ============================================
const clothUploadArea = document.getElementById('clothUploadArea');
const clothFileInput = document.getElementById('clothFileInput');
const clothPreview = document.getElementById('clothPreview');

const personUploadArea = document.getElementById('personUploadArea');
const personFileInput = document.getElementById('personFileInput');
const personPreview = document.getElementById('personPreview');

const sourceBtns = document.querySelectorAll('.source-btn');
const genderBlock = document.getElementById('genderBlock');
const genderBtns = document.querySelectorAll('.gender-btn');

const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const resultImage = document.getElementById('resultImage');

// ============================================
// УТИЛИТА: обработка загрузки файла
// ============================================
function handleFileUpload(fileInput, previewEl, areaEl, callback) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('Файл слишком большой. Максимум 10 МБ.');
            return;
        }
        if (!file.type.startsWith('image/')) {
            alert('Пожалуйста, загрузите изображение.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            previewEl.src = event.target.result;
            previewEl.style.display = 'block';
            areaEl.classList.add('has-image');

            const icon = areaEl.querySelector('.upload-icon');
            const text = areaEl.querySelector('.upload-text');
            if (icon) icon.style.display = 'none';
            if (text) text.style.display = 'none';

            callback(event.target.result);
            checkFormReady();
            if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
        };
        reader.readAsDataURL(file);
    });
}

// ============================================
// ЗАГРУЗКА ФОТО ОДЕЖДЫ
// ============================================
clothUploadArea.addEventListener('click', () => clothFileInput.click());
handleFileUpload(
    clothFileInput,
    clothPreview,
    clothUploadArea,
    (base64) => { clothImage = base64; }
);

// ============================================
// ЗАГРУЗКА ФОТО ЧЕЛОВЕКА
// ============================================
personUploadArea.addEventListener('click', () => personFileInput.click());
handleFileUpload(
    personFileInput,
    personPreview,
    personUploadArea,
    (base64) => { personImage = base64; }
);

// ============================================
// ПЕРЕКЛЮЧАТЕЛЬ ИСТОЧНИКА (upload / generate)
// ============================================
sourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        sourceBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sourceMode = btn.dataset.source;

        if (sourceMode === 'upload') {
            personUploadArea.style.display = 'block';
            genderBlock.style.display = 'none';
            selectedGender = null;
            genderBtns.forEach(b => b.classList.remove('active'));
        } else {
            personUploadArea.style.display = 'none';
            genderBlock.style.display = 'block';
            personImage = null;
            personFileInput.value = '';
            personPreview.style.display = 'none';
            personUploadArea.classList.remove('has-image');
            const icon = personUploadArea.querySelector('.upload-icon');
            const text = personUploadArea.querySelector('.upload-text');
            if (icon) icon.style.display = 'block';
            if (text) text.style.display = 'block';
        }

        checkFormReady();
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    });
});

// ============================================
// ВЫБОР ПОЛА
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
// ПРОВЕРКА ГОТОВНОСТИ
// ============================================
function checkFormReady() {
    if (!clothImage) {
        generateBtn.disabled = true;
        return;
    }
    if (sourceMode === 'upload') {
        generateBtn.disabled = !personImage;
    } else {
        generateBtn.disabled = !selectedGender;
    }
}

// ============================================
// ГЕНЕРАЦИЯ
// ============================================
generateBtn.addEventListener('click', async () => {
    if (!clothImage) return;

    loading.style.display = 'block';
    resultImage.style.display = 'none';
    generateBtn.disabled = true;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    const payload = {
        clothImage: clothImage,
        mode: sourceMode
    };

    if (sourceMode === 'upload') {
        payload.personImage = personImage;
    } else {
        payload.gender = selectedGender;
    }

    console.log('Отправка payload, поля:', Object.keys(payload).join(', '));

    try {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Сервер вернул ошибку: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            resultImage.src = data.imageUrl;
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

console.log('QIAN Fashion AI: приложение загружено');
console.log('API_URL:', API_URL);